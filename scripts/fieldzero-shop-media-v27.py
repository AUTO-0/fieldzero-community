#!/usr/bin/env python3
"""Download appropriately licensed Commons equipment photos and optimize them for FIELDZERO Supply.
No retailer images, scraping of shops, or unverified product pricing.
These illustrations are not owner stock catalogue records.
"""
import io
import pathlib
import random
import time
import urllib.parse
import urllib.request
from PIL import Image, ImageOps

OUT=pathlib.Path("assets/fieldzero-shop-media-v27")
OUT.mkdir(parents=True,exist_ok=True)
MEDIA=[
 # Output name, Commons file title, target long edge, verified license
 ("hero-gel-blaster","P90 No Bg.png",1920,"CC0 1.0"),
 ("category-gel-blasters","Gel Blaster HK416 & ACR.jpg",1100,"CC BY-SA 4.0"),
 ("category-safety-masks","Paintball Schutzmaske vorne.jpg",1100,"CC BY-SA 3.0"),
 ("category-gel-balls","Gel balls.jpg",1100,"CC BY 2.0"),
 ("category-eye-protection","Safety Goggles at AERD.jpg",1100,"CC BY-SA 4.0"),
 ("category-batteries","Akku der Softairwaffe H&K USP Tactical.png",1100,"CC BY-SA 3.0"),
 ("category-target-practice","Paper Target.jpg",1100,"CC BY-SA 3.0"),
 ("category-operator-apparel","MARS Armor Model 78 tactical vest.jpg",1100,"CC BY-SA 4.0"),
 ("category-gear-accessories","Equipaggiamento softair.jpg",1100,"CC BY-SA 4.0"),
]
HEADERS={"User-Agent":"FIELDZEROCommunityWeb/1.0 (https://auto-0.github.io/fieldzero-community/; photo licence attribution); Python urllib","Accept":"image/avif,image/webp,image/png,image/jpeg,image/*"}
def download(name,title,max_px,licence):
    dest=OUT/(name+".webp")
    if dest.exists() and dest.stat().st_size>10000:
        print("Already present:",dest)
        return True
    url="https://commons.wikimedia.org/wiki/Special:Redirect/file/"+urllib.parse.quote(title,safe="")
    # Browser-style redirect requests; media retrieved directly from verified Wikimedia Commons titles.
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers=HEADERS)
            with urllib.request.urlopen(req,timeout=35) as response:
                data=response.read(16_000_000)
                if len(data)<5_000 or len(data)>=16_000_000:
                    raise ValueError("image outside expected media size")
            with Image.open(io.BytesIO(data)) as original:
                image=ImageOps.exif_transpose(original)
                image.thumbnail((max_px,max_px),Image.Resampling.LANCZOS)
                if image.mode in ("RGBA","LA") or "transparency" in image.info:
                    image=image.convert("RGBA")
                else:
                    image=image.convert("RGB")
                image.save(dest,"WEBP",quality=88,method=6)
            print("Downloaded",title,"->",dest,round(dest.stat().st_size/1024),"KB",image.size,licence)
            return True
        except Exception as exc:
            print("Retry",name,attempt+1,repr(exc))
            time.sleep(2*(attempt+1))
    return False
if __name__=="__main__":
    results=[(name,download(name,title,size,licence)) for name,title,size,licence in MEDIA]
    failed=[name for name,good in results if not good]
    if failed:
        raise SystemExit("Media optimization failed for: "+", ".join(failed))
    print("Nine verified Commons photographs optimized for website deployment.")
