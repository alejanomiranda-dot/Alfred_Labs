import {zipSync,strToU8} from 'fflate';
export function stlBytes(mesh){
 const n=mesh.triangles.length/3,buffer=new ArrayBuffer(84+n*50),view=new DataView(buffer);
 new Uint8Array(buffer).set(new TextEncoder().encode('Taller de Vero | STL | coordinates in millimeters'));
 view.setUint32(80,n,true);
 for(let i=0;i<n;i++){
  const v=[0,1,2].map(j=>{const id=mesh.triangles[i*3+j]*mesh.numProp;return [mesh.positions[id],mesh.positions[id+1],mesh.positions[id+2]];});
  const a=v[1].map((x,k)=>x-v[0][k]),b=v[2].map((x,k)=>x-v[0][k]);
  const normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const len=Math.hypot(...normal)||1;
  const values=[...normal.map(x=>x/len),...v.flat()];
  values.forEach((value,j)=>view.setFloat32(84+i*50+j*4,value,true));
 }
 return new Uint8Array(buffer);
}
const esc=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function objectXml(m,id,name,index){
 let vertices='',triangles='';
 for(let i=0;i<m.positions.length;i+=m.numProp)vertices+=`<vertex x="${m.positions[i]}" y="${m.positions[i+1]}" z="${m.positions[i+2]}"/>`;
 for(let i=0;i<m.triangles.length;i+=3)triangles+=`<triangle v1="${m.triangles[i]}" v2="${m.triangles[i+1]}" v3="${m.triangles[i+2]}"/>`;
 return `<object id="${id}" type="model" name="${esc(name)}" pid="1" pindex="${index}"><mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh></object>`;
}
export function threeMfBytes(model){
 const p=model.params;const hasDetail=model.detail.triangles.length>0;
 const xml=`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="es" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${esc(p.project)}</metadata><metadata name="Application">Taller de Vero</metadata><resources><basematerials id="1"><base name="Base" displaycolor="${p.baseColor.toUpperCase()}FF"/><base name="Relieve" displaycolor="${p.detailColor.toUpperCase()}FF"/></basematerials>${objectXml(model.base,2,'Base',0)}${hasDetail?objectXml(model.detail,3,'Relieve',1):''}<object id="4" type="model" name="${esc(p.project)}"><components><component objectid="2"/>${hasDetail?'<component objectid="3"/>':''}</components></object></resources><build><item objectid="4"/></build></model>`;
 return zipSync({'[Content_Types].xml':strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),'_rels/.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),'3D/3dmodel.model':strToU8(xml),'Metadata/taller-de-vero.json':strToU8(JSON.stringify(p,null,2))});
}
