from pathlib import Path
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor
import json

assets = {
 'iphone-16':'https://www.apple.com/in/iphone-16/images/meta/iphone-16_specs__bq5wb41xhdle_og.png?202610070353',
 'galaxy-s25':'https://images.samsung.com/is/image/samsung/assets/in/2501/smartphones/galaxy-s25/specs/163x346_Icyblue_P1.jpg?$163_346_PNG$',
 'oneplus-13':'https://oasis.opstatics.com/content/dam/oasis/page/2024/global/phones/13/specs/13-blue.png',
 'macbook-air-m4':'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/mba-13inch-15inch.png',
 'zenbook-14':'https://dlcdnwebimgs.asus.com/gain/7aadfea8-3d7b-4fd5-b2f5-44060507985f/w800',
 'macbook-pro-m4':'https://www.apple.com/newsroom/images/2024/10/new-macbook-pro/article/Apple-MacBook-Pro-M4-lineup_big.jpg.large.jpg',
 'ipad-a16':'https://www.apple.com/v/ipad-11/specs/d/images/specs/finish__ff9ehlnqqxqy_large.jpg',
 'watch-series-10':'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/121202-apple-watch-series-10.png',
 'airpods-4':'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/121203-airpods-4.png',
 'mx-master-3s':'https://resource.logitech.com/w_544,h_466,ar_7:6,c_pad,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/mice/mx-master-3s/2025-update/mx-master-3s-bluetooth-edition-top-view-black-new-1.png',
 'ps5-slim':'https://gmedia.playstation.com/is/image/SIEPDC/ps5-slim-edition-left-image-block-01-en-24jun24?wid=800&fmt=png-alpha'
}
root=Path(__file__).parent
out=root/'public'/'images'/'real'
out.mkdir(parents=True,exist_ok=True)
def download(pair):
 name,url=pair
 with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=40) as r:
  mime=r.headers.get_content_type(); content=r.read()
 extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime]
 path=out/f'{name}.{extension}';path.write_bytes(content)
 return name,{'photo':f'/images/real/{path.name}','source':url,'bytes':len(content)}
if __name__=='__main__':
 result=dict(ThreadPoolExecutor(max_workers=6).map(download,assets.items()))
 (root/'real-assets.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
 print(json.dumps(result,indent=2))
