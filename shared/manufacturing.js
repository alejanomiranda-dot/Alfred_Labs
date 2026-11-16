// Design intent, never evidence that a mechanism moves or has been printed.
export const singleBody={mode:'single',expectedParts:1,clearance:0,minWall:1.2};
export function validateManufacturing(value){
 if(value===undefined||value===null)return {...singleBody};
 if(!value||!['single','print_in_place','assembly'].includes(value.mode)||!Number.isInteger(value.expectedParts)||value.expectedParts<1||value.expectedParts>32||!Number.isFinite(value.clearance)||value.clearance<0||value.clearance>2||!Number.isFinite(value.minWall)||value.minWall<1.2||value.minWall>10)throw Error('Especificación de fabricación inválida.');
 if(value.mode==='single'&&(value.expectedParts!==1||value.clearance!==0))throw Error('Una pieza fija debe tener un solo cuerpo.');
 if(value.mode!=='single'&&(value.expectedParts<2||value.clearance<.3))throw Error('Un mecanismo necesita al menos dos cuerpos y 0,3 mm de holgura nominal.');
 return {mode:value.mode,expectedParts:value.expectedParts,clearance:value.clearance,minWall:value.minWall};
}
export const manufacturingOf=params=>validateManufacturing(params?.forge?.revisions.find(r=>r.id===params.forge.selected)?.manufacturing);
export const isMechanism=value=>!!value&&value.mode!=='single';
export const technicalFinish={texture:'none',smooth:0,depth:0,scale:8};
