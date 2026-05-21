const fs = require('fs');
const content = fs.readFileSync('public/models/jgheaburi-2.gltf', 'utf8');
const gltf = JSON.parse(content);

// Get the world translation of baza_stalp (idx 1) - which is the left pillar base
// baza_stalp (idx=1), stalp_1 (idx=11), PereteSTG (idx=12)
// baza_stalp001 (idx=123), stalp_2 (idx=133), PereteDR (idx=134)

function getNodeWorldTranslation(idx) {
  // Climb up the tree, accumulating translations
  const node = gltf.nodes[idx];
  let x = (node.translation || [0,0,0])[0];
  let y = (node.translation || [0,0,0])[1];
  let z = (node.translation || [0,0,0])[2];
  
  // Find parent
  for (let i = 0; i < gltf.nodes.length; i++) {
    const n = gltf.nodes[i];
    if (n.children && n.children.includes(idx)) {
      const [px, py, pz] = getNodeWorldTranslation(i);
      return [x + px, y + py, z + pz];
    }
  }
  return [x, y, z];
}

console.log('PereteSTG(12) world:', getNodeWorldTranslation(12));
console.log('PereteDR(134) world:', getNodeWorldTranslation(134));
console.log('baza_stalp(1) world:', getNodeWorldTranslation(1));
console.log('baza_stalp001(123) world:', getNodeWorldTranslation(123));
console.log('stalp_1(11) world:', getNodeWorldTranslation(11));
console.log('stalp_2(133) world:', getNodeWorldTranslation(133));
