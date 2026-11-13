from PIL import Image, ImageOps, ImageDraw
from pathlib import Path
files=sorted(Path('evidence/smoke').glob('*.png'))
sheet=Image.new('RGB',(1020,4*238),'#DDDDDD')
for i,file in enumerate(files):
 im=Image.open(file).convert('RGB'); im.thumbnail((340,215)); x=(i%3)*340; y=(i//3)*238
 sheet.paste(im,(x,y+22)); ImageDraw.Draw(sheet).text((x+8,y+4),file.stem,fill='black')
sheet.save('evidence/smoke/contact-sheet.jpg')
