// Flat shapes for engraving, relief and extrusion: text in three typefaces and a small icon library.
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import gentilis from 'three/examples/fonts/gentilis_bold.typeface.json' with {type:'json'};
import helvetiker from 'three/examples/fonts/helvetiker_bold.typeface.json' with {type:'json'};
import optimer from 'three/examples/fonts/optimer_bold.typeface.json' with {type:'json'};
const loader=new FontLoader();
export const fonts={gentilis:loader.parse(gentilis),helvetiker:loader.parse(helvetiker),optimer:loader.parse(optimer)};
export const fontNames=Object.keys(fonts);
export const iconNames=['heart','paw','star','leaf','flower','bone','house','moon'];
export function printableText(text){return text.normalize('NFC');}
export function fontOf(name,text=''){
 const preferred=fonts[name]||fonts.gentilis,chars=[...printableText(text)].filter(c=>c!==' ');
 return chars.some(c=>!preferred.data.glyphs[c])&&chars.every(c=>fonts.gentilis.data.glyphs[c])?fonts.gentilis:preferred;
}
export function missingGlyph(text,fontName){const font=fontOf(fontName,text);for(const c of printableText(text))if(c!==' '&&!font.data.glyphs[c])return c;return null;}

const circle=(cx,cy,r,n=48)=>Array.from({length:n},(_,i)=>[cx+r*Math.cos(i/n*Math.PI*2),cy+r*Math.sin(i/n*Math.PI*2)]);
// Each icon is drawn in a 100×100 box (y up) as a union of filled outlines, minus optional holes.
const icons={
 heart:()=>({fill:[Array.from({length:96},(_,i)=>{const t=i/96*Math.PI*2;return [16*Math.sin(t)**3*3,(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))*3+5];})]}),
 star:()=>({fill:[Array.from({length:10},(_,i)=>{const r=i%2?21:50,a=Math.PI/2+i*Math.PI/5;return [r*Math.cos(a),r*Math.sin(a)];})]}),
 paw:()=>({fill:[circle(0,-18,24),circle(-30,14,11),circle(-11,32,12),circle(11,32,12),circle(30,14,11)]}),
 leaf:()=>({fill:[[...Array.from({length:40},(_,i)=>{const t=i/39;return [-38*Math.sin(Math.PI*t)*.9,-50+100*t];}),...Array.from({length:40},(_,i)=>{const t=1-i/39;return [38*Math.sin(Math.PI*t)*.9,-50+100*t];})]],hole:[[[-2,-46],[2,-46],[2,40],[-2,40]]]}),
 flower:()=>({fill:[...Array.from({length:5},(_,i)=>{const a=Math.PI/2+i*Math.PI*2/5;return circle(Math.cos(a)*27,Math.sin(a)*27,20);}),circle(0,0,16)],hole:[circle(0,0,8)]}),
 bone:()=>({fill:[[[-36,-9],[36,-9],[36,9],[-36,9]],circle(-38,-11,13),circle(-38,11,13),circle(38,-11,13),circle(38,11,13)]}),
 house:()=>({fill:[[[-40,-45],[40,-45],[40,5],[0,45],[-40,5]]],hole:[[[-11,-45],[11,-45],[11,-10],[-11,-10]]]}),
 moon:()=>({fill:[circle(0,0,46)],hole:[circle(20,12,40)]})
};
function section(C,own,fill,holes,size){
 let cs=own(C.union(fill.map(p=>own(new C([p],'EvenOdd')))));
 for(const h of holes||[])cs=own(cs.subtract(own(new C([h],'EvenOdd'))));
 const b=cs.bounds(),scale=size/Math.max(b.max[1]-b.min[1],1e-6);
 return own(own(cs.translate([-(b.min[0]+b.max[0])/2,-(b.min[1]+b.max[1])/2])).scale([scale,scale]));
}
// The node's flat outline, centered on the origin: an icon `fontSize` tall, or the text in its typeface.
export function shapeSection(C,own,n){
 if(n.icon){const def=icons[n.icon]();return section(C,own,def.fill,def.hole,n.fontSize);}
 const shapes=fontOf(n.font,n.text).generateShapes(printableText(n.text),n.fontSize),polys=shapes.flatMap(s=>{const e=s.extractPoints(6);return [e.shape,...e.holes].map(p=>p.map(v=>[v.x,v.y]));});
 const cs=own(new C(polys,'EvenOdd'));if(cs.isEmpty())throw Error('El texto quedó vacío.');const b=cs.bounds();
 return own(cs.translate([-(b.min[0]+b.max[0])/2,-(b.min[1]+b.max[1])/2]));
}
