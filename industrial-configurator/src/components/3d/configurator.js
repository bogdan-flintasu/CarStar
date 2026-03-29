import * as THREE from 'three';
import { GLTFLoader } from 'jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';

//Scena si background
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaaaaaaa);

//Camera
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(-6, 7, 13);

//Renderer (leaga camera si scena de html)
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('scene-container').appendChild(renderer.domElement);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

//Lumina
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);

const ambient = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambient);

//Lumini umbre
light.castShadow = true;
light.receiveShadow = true;
light.shadow.mapSize.width = 4096;
light.shadow.mapSize.height = 4096;
light.shadow.bias = -0.005;
light.shadow.normalBias = 0.005;
light.shadow.camera.left = -100;
light.shadow.camera.right = 100;
light.shadow.camera.top = 100;
light.shadow.camera.bottom = -100;
light.shadow.camera.near = 1;
light.shadow.camera.far = 100;

//Plan pentru umbre
const planeGeometry = new THREE.PlaneGeometry(400, 400);
const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.4 });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
plane.position.y = 0;
plane.receiveShadow = true;
scene.add(plane);

//Controale
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

function updateCamera(length) {
    camera.position.set(
        Math.min(-10, -length * 0.3),
        Math.max(6, length * 0.2),
        Math.max(10, length * 0.2)
    );

    const centerZ = -length / 2;

    controls.target.set(0, 0, centerZ);
    controls.update();
}

function updateLastFrameBeams() {
    if (!modelsGroup || modelsGroup.children.length === 0) return;

    const lastIndex = modelsGroup.children.length - 1;

    modelsGroup.children.forEach((frame, i) => {
        frame.traverse(child => {
            if (!child.userData.isGrinda) return;
            if (i === lastIndex) {
                child.visible = false;
            } else {
                child.visible = true;
            }
        });
    });
}


function syncGrinziFor15() {
    if (!modelsGroup) return;


    modelsGroup.children.forEach((frame, index) => {
        if (index === 0) return;


        if (!frame.getObjectByName("extraGrindaLeft") && extraGrindaLeft) {
            const anchorLeft = frame.getObjectByName(lastGrindaLeft.name);
            if (anchorLeft) {
                const extraGrindaLeftClone = extraGrindaLeft.clone(true);
                extraGrindaLeftClone.name = "extraGrindaLeft";
                extraGrindaLeftClone.userData.isGrinda = true;
                extraGrindaLeftClone.position.copy(extraGrindaLeft.position);
                anchorLeft.parent.add(extraGrindaLeftClone);
            }
        }

        if (!frame.getObjectByName("extraGrindaRight") && extraGrindaRight) {
            const anchorRight = frame.getObjectByName(lastGrindaRight.name);
            if (anchorRight) {
                const extraGrindaRightClone = extraGrindaRight.clone(true);
                extraGrindaRightClone.name = "extraGrindaRight";
                extraGrindaRightClone.userData.isGrinda = true;
                extraGrindaRightClone.position.copy(extraGrindaRight.position);
                anchorRight.parent.add(extraGrindaRightClone);
            }
        }
    });

}

function syncGrinziFor18() {
    if (!modelsGroup) return;


    modelsGroup.children.forEach((frame, index) => {
        if (index === 0) return;


        if (!frame.getObjectByName("newGrindaLeft") && newGrindaLeft) {
            const anchorLeft = frame.getObjectByName(lastGrindaLeft.name);
            if (anchorLeft) {
                const newGrindaLeftClone = newGrindaLeft.clone(true);
                newGrindaLeftClone.name = "newGrindaLeft";
                newGrindaLeftClone.userData.isGrinda = true;
                newGrindaLeftClone.position.copy(newGrindaLeft.position);
                anchorLeft.parent.add(newGrindaLeftClone);
            }
        }

        if (!frame.getObjectByName("newGrindaRight") && newGrindaRight) {
            const anchorRight = frame.getObjectByName(lastGrindaRight.name);
            if (anchorRight) {
                const newGrindaRightClone = newGrindaRight.clone(true);
                newGrindaRightClone.name = "newGrindaRight";
                newGrindaRightClone.userData.isGrinda = true;
                newGrindaRightClone.position.copy(newGrindaRight.position);
                anchorRight.parent.add(newGrindaRightClone);
            }
        }
    });

}

function syncGrinziBasedOnWidth() {
    const width = parseInt(widthSlider.value, 10);

    if (width >= 18) {
        syncGrinziFor18();
    } else {
        syncGrinziFor15();
    }
}

//Loader model
const loader = new GLTFLoader();
let resize_height = [];
let lowered = [];
let threemeters = []
let fourmeters_lower = [];
let fourmeters_height = 0;
let fivemeters = [];
let resize_width = [];
let left = [];
let right = [];
let grinzi = [];
let grinziLeft = [];
let grinziRight = [];


let initial_scale = 1;
const model_height = 6;
let baza_stalp = null;
let baza_stalp001 = null;
let suruburi_sus001 = null;
let suruburi_sus002 = null;
let plane_sus_1 = null;
let plane_sus_2 = null;
let baseModel = null;
let extraGrindaLeft = null;
let newGrindaLeft = null;
let extraGrindaLeftTemplate = null;
let newGrindaLeftTemplate = null;
let extraGrindaRight = null;
let newGrindaRight = null;
let extraGrindaRightTemplate = null;
let newGrindaRightTemplate = null;
let DeltaX = 1.5363;
let DeltaY = 0.27089;
let lastGrindaLeft = null;
let lastGrindaRight = null;

let modelsGroup;
let distanceLength = 6;
const initial_width = 12;

loader.load(window.MODEL_URL, (gltf) => {
    const model = gltf.scene;
    model.position.set(0, 0, 0);



    model.traverse((child) => {
        if (child.isMesh) {

            child.castShadow = true;
            child.receiveShadow = true;

            if (child.name === "suruburi_laterale008") {
                lastGrindaLeft = child;
                extraGrindaLeftTemplate = child;
                newGrindaLeftTemplate = child;
            }

            if (child.name === "suruburi_laterale017") {
                lastGrindaRight = child;
                extraGrindaRightTemplate = child;
                newGrindaRightTemplate = child;
            }

            if (child.name === "baza_stalp" || child.name === "stalp_sus_1" || child.name === "suruburi_sus001") {
                left.push(child);
            }

            if (child.name === "baza_stalp001" || child.name === "stalp_sus" || child.name === "suruburi_sus002") {
                right.push(child);
            }

            if (child.name === "suruburi_laterale005" || child.name === "suruburi_laterale006" || child.name === "suruburi_laterale007" || child.name === "suruburi_laterale008") {
                grinziLeft.push(child);
                child.userData.initialX = child.position.x;
                child.userData.initialY = child.position.y;
            }

            if (child.name === "suruburi_laterale014" || child.name === "suruburi_laterale015" || child.name === "suruburi_laterale016" || child.name === "suruburi_laterale017") {
                grinziRight.push(child);
                child.userData.initialX = child.position.x;
                child.userData.initialY = child.position.y;
            }

            if (child.name === "stalp_1" || child.name === "stalp_2") {
                resize_height.push(child);
            }

            if (child.name === "suruburi_sus001" || child.name === "suruburi_sus002" || child.name === "aripa_lateral" || child.name === "plane_aripioara001" || child.name === "suruburi_sus" || child.name === "aripioara_sustinere_sus" || child.name === "aripioara_lateral" || child.name === "plane_aripioara" || child.name === "suruburi_sus003" || child.name === "aripioara_sustinere_sus002" || child.name === "aripioara_sustinere_sus002" || child.name === "plane_sus_1" || child.name === "plane_sus_2") {
                lowered.push(child);
                child.userData.initialY = child.position.y;
            }

            if (child.name === "suruburi_laterale002" || child.name === "suruburi_laterale003" || child.name === "suruburi_laterale011" || child.name === "suruburi_laterale012") {
                threemeters.push(child);
            }

            if (child.name === "suruburi_laterale002" || child.name === "suruburi_laterale011") {
                fourmeters_lower.push(child);
            }

            if (child.name === "suruburi_laterale003" || child.name === "suruburi_laterale012") {
                fivemeters.push(child);
            }



            if (child.name === "stalp_sus" || child.name === "stalp_sus_1") {
                resize_width.push(child);
                child.userData.initialX = child.position.x;
                child.userData.initialY = child.position.y;

                const geom = child.geometry;
                geom.computeBoundingBox();
                const box = geom.boundingBox;
                child.userData.localLength = box.max.x - box.min.x;
            }


            if (child.name === "baza_stalp") {
                baza_stalp = child;
                baza_stalp.userData.initialX = child.position.x;
            }

            if (child.name === "baza_stalp001") {
                baza_stalp001 = child;
                baza_stalp001.userData.initialX = child.position.x;
            }

            if (child.name === "suruburi_sus001") {
                suruburi_sus001 = child;
                suruburi_sus001.userData.initialX = child.position.x;
            }

            if (child.name === "suruburi_sus002") {
                suruburi_sus002 = child;
                suruburi_sus002.userData.initialX = child.position.x;
            }

            if (child.name === "plane_sus_1") {
                plane_sus_1 = child;
                plane_sus_1.userData.initialY = child.position.y;
            }

            if (child.name === "plane_sus_2") {
                plane_sus_2 = child;
                plane_sus_2.userData.initialY = child.position.y;
            }

            if (child.name.includes("Grinda")) {
                child.userData.isGrinda = true;
                grinzi.push(child);
            }
        }
    });

    const initial_height = 3;
    const scale = initial_height / model_height;
    initial_scale = scale;

    resize_height.forEach(mesh => {
        mesh.scale.y = scale;
    })
    lowered.forEach(object => {
        object.position.y = -initial_height;
        object.userData.initialY = object.position.y;
    })

    resize_width.forEach(object => {
        object.position.y = object.userData.initialY / 2 + 0.0386;
        object.userData.initialY = object.position.y;
    })
    threemeters.forEach(obj => {
        if (obj.parent) {
            obj.visible = false;
        }
    });

    fourmeters_lower.forEach(obj => {
        fourmeters_height = obj.position.y;
    });

    modelsGroup = new THREE.Group();
    scene.add(modelsGroup);

    baseModel = model;
    baseModel.userData.isBase = true;
    modelsGroup.add(baseModel);

    for (let i = 1; i < 3; i++) {
        const clone = baseModel.clone(true);
        clone.position.z = -i * distanceLength;
        modelsGroup.add(clone);
    }

    updateLastFrameBeams();

    document.getElementById("widthValue").textContent = initial_width;
    document.getElementById("widthSlider").value = initial_width;

    document.getElementById("heightValue").textContent = initial_height;
    document.getElementById("heightSlider").value = initial_height;

}, undefined, (error) => {
    console.error(error);
});

//slider lungime
const lengthSlider = document.getElementById("lengthSlider");
const lengthValue = document.getElementById("lengthValue");



lengthSlider.addEventListener("input", () => {
    const newLength = parseInt(lengthSlider.value, 10);
    lengthValue.textContent = newLength;

    const requiredCount = Math.floor(newLength / distanceLength) + 1;

    while (modelsGroup.children.length > requiredCount) {
        modelsGroup.remove(modelsGroup.children.at(-1));
    }

    for (let i = modelsGroup.children.length; i < requiredCount; i++) {
        const clone = baseModel.clone(true);
        clone.position.z = -i * distanceLength;

        modelsGroup.add(clone);
    }



    updateCamera(newLength);
    updateLastFrameBeams();

});





//slider height
const heightSlider = document.getElementById("heightSlider");
const heightValue = document.getElementById("heightValue");
let ok = true;
let currentRise = 0

heightSlider.addEventListener("input", () => {
    const new_height = parseInt(heightSlider.value, 10);
    heightValue.textContent = new_height;

    const scale = new_height / model_height;
    resize_height.forEach(mesh => {
        mesh.scale.y = scale;
    });

    const deltaHeight = (scale - initial_scale) * model_height;
    lowered.forEach(object => {
        object.position.y = object.userData.initialY + deltaHeight;
    });

    resize_width.forEach(object => {
        object.position.y = object.userData.initialY + deltaHeight;
    });

    if (plane_sus_1 && plane_sus_2) {
        plane_sus_1.position.y = plane_sus_1.userData.initialY + deltaHeight + currentRise;
        plane_sus_2.position.y = plane_sus_2.userData.initialY + deltaHeight + currentRise;
    }

    if (new_height === 3) {
        threemeters.forEach(obj => {
            if (obj.parent) {
                obj.visible = false;
            }
        });
    }
    else if (new_height === 4) {
        fourmeters_lower.forEach(obj => {
            obj.position.y = fourmeters_height;
            obj.visible = true;
            obj.position.y = obj.position.y - 0.3;
            ok = true;
        });
        fivemeters.forEach(obj => {
            if (obj.parent) {
                obj.visible = false;
            }
        });
    }
    else if (new_height === 5) {
        if (ok === true) {
            fourmeters_lower.forEach(obj => {
                obj.position.y = obj.position.y + 0.3;
                ok = false;
            });
        }

        fivemeters.forEach(obj => {
            if (obj.parent) {
                obj.visible = false;
            }
        });
    }
    else {
        threemeters.forEach(obj => {
            obj.visible = true;
        });
    }

    modelsGroup.children.forEach((child, i) => {
        if (i > 0) {
            child.traverse((mesh, j) => {
                if (mesh.isMesh) {
                    const baseMesh = baseModel.getObjectByName(mesh.name);
                    if (baseMesh) {
                        mesh.scale.copy(baseMesh.scale);
                        mesh.rotation.copy(baseMesh.rotation);
                        mesh.position.copy(baseMesh.position);

                        if (!mesh.userData.isGrinda) {
                            mesh.visible = baseMesh.visible;
                        }
                    }
                }
            });
        }
    });
    updateLastFrameBeams();

});

//slider latime
const widthSlider = document.getElementById("widthSlider");
const widthValue = document.getElementById("widthValue");
const model_width = 12;
const minWidth = 8;
const midWidth = 12;
const maxWidth = 20;
const maxrise = 0.696;
const minrise = -0.335;

widthSlider.addEventListener("input", () => {
    const new_width = parseInt(widthSlider.value, 10);
    widthValue.textContent = new_width;

    const half_new = new_width / 2;
    const half_initial = model_width / 2;
    const scaleX = half_new / half_initial;

    const delta = half_new - half_initial;

    const widthDelta = new_width - initial_width;

    if (baza_stalp && baza_stalp001 && suruburi_sus001 && suruburi_sus002) {
        baza_stalp.position.x = baza_stalp.userData.initialX - delta;
        suruburi_sus001.position.x = suruburi_sus001.userData.initialX - delta;

        baza_stalp001.position.x = baza_stalp001.userData.initialX + delta;
        suruburi_sus002.position.x = suruburi_sus002.userData.initialX + delta;
    }

    let rise = 0;

    if (new_width >= midWidth) {
        const t = (new_width - midWidth) / (maxWidth - midWidth);
        rise = t * maxrise;
    } else {
        const t = (midWidth - new_width) / (midWidth - minWidth);
        rise = t * minrise;
    }

    currentRise = rise;

    if (new_width <= 9 && grinziLeft.includes(lastGrindaLeft)) {
        lastGrindaLeft.parent.remove(lastGrindaLeft);
        grinziLeft = grinziLeft.filter(m => m !== lastGrindaLeft);

        lastGrindaRight.parent.remove(lastGrindaRight);
        grinziRight = grinziRight.filter(m => m !== lastGrindaRight);

        if (modelsGroup) {
            modelsGroup.children.forEach((frame, index) => {
                if (index === 0) return;

                const left = frame.getObjectByName(lastGrindaLeft.name);
                if (left && left.parent) {
                    left.parent.remove(left);
                }

                const right = frame.getObjectByName(lastGrindaRight.name);
                if (right && right.parent) {
                    right.parent.remove(right);
                }
            });
        }
    }

    if (new_width > 9 && !grinziLeft.includes(lastGrindaLeft)) {
        const parentLeft = grinziLeft[0].parent;
        parentLeft.add(lastGrindaLeft);
        grinziLeft.push(lastGrindaLeft);

        const parentRight = grinziRight[0].parent;
        parentRight.add(lastGrindaRight);
        grinziRight.push(lastGrindaRight);

        if (modelsGroup) {
            modelsGroup.children.forEach((frame, index) => {
                if (index === 0) return;

                const anchorLeft = frame.getObjectByName(grinziLeft[0].name);
                if (anchorLeft && !frame.getObjectByName(lastGrindaLeft.name)) {
                    const cloneLeft = lastGrindaLeft.clone(true);
                    anchorLeft.parent.add(cloneLeft);
                }

                const anchorRight = frame.getObjectByName(grinziRight[0].name);
                if (anchorRight && !frame.getObjectByName(lastGrindaRight.name)) {
                    const cloneRight = lastGrindaRight.clone(true);
                    anchorRight.parent.add(cloneRight);
                }
            });
        }


    }

    if (new_width === 11 || new_width === 10 || new_width === 8 || new_width === 9) {
        const move = widthDelta / 8.3;
        let moveFactor = move;
        let riseFactorRight = rise * 0.252;
        let riseFactorLeft = rise * 0.255;

        if (new_width === 9) {

            moveFactor = move * -0.09;
            riseFactorRight = rise * -0.0295;
            riseFactorLeft = rise * -0.026;
        }
        else if (new_width === 8) {
            moveFactor = move * 0.26;
            riseFactorRight = rise * 0.0627;
            riseFactorLeft = rise * 0.0658;
        }

        for (let i = 0; i < grinziLeft.length; i++) {
            let moveOffset = (i + 1) * moveFactor;
            let riseOffset = (i + 1) * riseFactorLeft;

            grinziLeft[i].position.x = grinziLeft[i].userData.initialX + moveOffset;
            grinziLeft[i].position.y = grinziLeft[i].userData.initialY + riseOffset;
        }

        for (let i = 0; i < grinziRight.length; i++) {
            let moveOffset = (i + 1) * moveFactor;
            let riseOffset = (i + 1) * riseFactorRight;

            grinziRight[i].position.x = grinziRight[i].userData.initialX - moveOffset;
            grinziRight[i].position.y = grinziRight[i].userData.initialY + riseOffset;
        }
    }

    if (new_width >= 15 && !extraGrindaLeft && extraGrindaLeftTemplate && !extraGrindaRight && extraGrindaRightTemplate) {
        extraGrindaLeft = extraGrindaLeftTemplate.clone(true);

        extraGrindaLeft.position.copy(lastGrindaLeft.position);
        extraGrindaLeft.position.x += DeltaX * 0.315;
        extraGrindaLeft.position.y += DeltaY * 0.315;

        extraGrindaLeft.userData.initialX = extraGrindaLeft.position.x;
        extraGrindaLeft.userData.initialY = extraGrindaLeft.position.y;

        extraGrindaLeft.name = "extraGrindaLeft";
        extraGrindaLeftTemplate.parent.add(extraGrindaLeft);
        grinziLeft.push(extraGrindaLeft);



        extraGrindaRight = extraGrindaRightTemplate.clone(true);

        extraGrindaRight.position.copy(lastGrindaRight.position);
        extraGrindaRight.position.x -= DeltaX * 0.315;
        extraGrindaRight.position.y += DeltaY * 0.315;

        extraGrindaRight.userData.initialX = extraGrindaRight.position.x;
        extraGrindaRight.userData.initialY = extraGrindaRight.position.y;

        extraGrindaRight.name = "extraGrindaRight";
        extraGrindaRightTemplate.parent.add(extraGrindaRight);
        grinziRight.push(extraGrindaRight);

        syncGrinziBasedOnWidth();
    }



    if (new_width < 15 && extraGrindaLeft && extraGrindaRight) {
        extraGrindaLeft.parent.remove(extraGrindaLeft);
        grinziLeft = grinziLeft.filter(m => m !== extraGrindaLeft);
        extraGrindaLeft = null;

        extraGrindaRight.parent.remove(extraGrindaRight);
        grinziRight = grinziRight.filter(m => m !== extraGrindaRight);
        extraGrindaRight = null;

        if (modelsGroup) {
            modelsGroup.children.forEach((frame, index) => {
                if (index === 0) return;

                const left = frame.getObjectByName("extraGrindaLeft");
                if (left && left.parent) {
                    left.parent.remove(left);
                }

                const right = frame.getObjectByName("extraGrindaRight");
                if (right && right.parent) {
                    right.parent.remove(right);
                }
            });
        }
    }

    if (new_width >= 18 && !newGrindaLeft && !newGrindaRight) {
        newGrindaLeft = newGrindaLeftTemplate.clone(true);
        newGrindaRight = newGrindaRightTemplate.clone(true);

        newGrindaLeft.position.copy(lastGrindaLeft.position);
        newGrindaLeft.position.x += DeltaX * 1.383;
        newGrindaLeft.position.y += DeltaY * 1.4;
        newGrindaLeft.userData.initialX = newGrindaLeft.position.x;
        newGrindaLeft.userData.initialY = newGrindaLeft.position.y;

        newGrindaRight.position.copy(lastGrindaRight.position);
        newGrindaRight.position.x -= DeltaX * 1.383;
        newGrindaRight.position.y += DeltaY * 1.4;
        newGrindaRight.userData.initialX = newGrindaRight.position.x;
        newGrindaRight.userData.initialY = newGrindaRight.position.y;

        newGrindaLeft.name = "newGrindaLeft";
        newGrindaLeftTemplate.parent.add(newGrindaLeft);
        newGrindaRight.name = "newGrindaRight";
        newGrindaRightTemplate.parent.add(newGrindaRight);

        grinziRight.push(newGrindaRight);
        grinziLeft.push(newGrindaLeft);

        syncGrinziBasedOnWidth();
    }


    if (new_width < 18 && newGrindaLeft && newGrindaRight) {
        newGrindaLeft.parent.remove(newGrindaLeft);
        grinziLeft = grinziLeft.filter(m => m !== newGrindaLeft);
        newGrindaLeft = null;

        newGrindaRight.parent.remove(newGrindaRight);
        grinziRight = grinziRight.filter(m => m !== newGrindaRight);
        newGrindaRight = null;

        modelsGroup.children.forEach((frame, index) => {
            if (index === 0) return;

            const left = frame.getObjectByName("newGrindaLeft");
            const right = frame.getObjectByName("newGrindaRight");

            if (left && left.parent) {
                left.parent.remove(left);
            }

            if (right && right.parent) {
                right.parent.remove(right);
            }
        });
    }


    if (new_width > initial_width && new_width <= 14 || new_width >= 16 && new_width <= 17 || new_width >= 19 && new_width <= maxWidth) {
        const move = widthDelta / 8.3;
        let moveFactor = (new_width - 15) / 10.3;
        let riseFactor = (new_width - 15) / 58;
        let riseFactorRight;
        let riseFactorLeft;
        if (new_width > initial_width && new_width <= 14) {
            moveFactor = move;
            riseFactorRight = rise * 0.252;
            riseFactorLeft = rise * 0.255;
        }
        else if (new_width >= 19 && new_width <= 20) {
            moveFactor = (new_width - 18) / 12.4;
            riseFactorRight = (new_width - 18) / 70;
            riseFactorLeft = riseFactorRight;
        }
        else {
            riseFactorRight = riseFactor;
            riseFactorLeft = riseFactorRight;
        }

        for (let i = 0; i < grinziLeft.length; i++) {

            let moveOffset = (i + 1) * moveFactor;
            let riseOffset = (i + 1) * riseFactorLeft;

            grinziLeft[i].position.x = grinziLeft[i].userData.initialX + moveOffset;
            grinziLeft[i].position.y = grinziLeft[i].userData.initialY + riseOffset;
        }

        for (let i = 0; i < grinziRight.length; i++) {
            let moveOffset = (i + 1) * moveFactor;
            let riseOffset = (i + 1) * riseFactorRight;

            grinziRight[i].position.x = grinziRight[i].userData.initialX - moveOffset;
            grinziRight[i].position.y = grinziRight[i].userData.initialY + riseOffset;
        }
    }

    grinziLeft.forEach(mesh => {
        if (new_width === 15 || new_width === 12 || new_width === 18) {
            mesh.position.x = mesh.userData.initialX;
            mesh.position.y = mesh.userData.initialY + rise * 0.006;
        }
    });

    grinziRight.forEach(mesh => {
        if (new_width === 15 || new_width === 12 || new_width === 18) {
            mesh.position.x = mesh.userData.initialX;
            mesh.position.y = mesh.userData.initialY + rise * 0.006;
        }
    });


    resize_width.forEach(mesh => {
        mesh.scale.x = scaleX;
        const length = (mesh.userData.localLength || 1) * mesh.scale.x;

        const angle = Math.atan2(rise, length);


        if (mesh.name.includes("stalp_sus_1")) {
            mesh.position.x = mesh.userData.initialX - delta;
            mesh.rotation.z = angle;
        }
        else {
            mesh.position.x = mesh.userData.initialX + delta;
            mesh.rotation.z = -angle;
        }

        const current_height = parseInt(heightSlider.value, 10);
        const scale = current_height / model_height;
        const deltaHeight = (scale - initial_scale) * model_height;

        if (plane_sus_1 && plane_sus_2) {
            plane_sus_1.position.y = plane_sus_1.userData.initialY + deltaHeight + rise;
            plane_sus_2.position.y = plane_sus_2.userData.initialY + deltaHeight + rise;
        }
    });

    const THRESHOLD = 12;

    let pullMain = 0;
    let pullStalp = 0;

    if (new_width > THRESHOLD) {
        const excess = new_width - THRESHOLD;
        pullMain = excess * 0.484;
        pullStalp = pullMain;
    }
    else {
        const deficit = THRESHOLD - new_width;
        pullMain = -deficit * 0.487;

        const STALP_FACTOR = 0.987;
        pullStalp = pullMain * STALP_FACTOR;
    }

    left.forEach(mesh => {
        const isStalpSus =
            mesh.name === "stalp_sus" ||
            mesh.name === "stalp_sus_1";

        const effectivePull = isStalpSus ? pullStalp : pullMain;

        mesh.position.x = mesh.userData.initialX - effectivePull;
    });

    right.forEach(mesh => {
        const isStalpSus =
            mesh.name === "stalp_sus" ||
            mesh.name === "stalp_sus_1";

        const effectivePull = isStalpSus ? pullStalp : pullMain;

        mesh.position.x = mesh.userData.initialX + effectivePull;
    });


    modelsGroup.children.forEach((child, i) => {
        if (i > 0) {
            child.traverse((mesh) => {
                if (mesh.isMesh) {
                    const baseMesh = baseModel.getObjectByName(mesh.name);
                    if (baseMesh) {
                        mesh.scale.copy(baseMesh.scale);
                        mesh.rotation.copy(baseMesh.rotation);
                        mesh.position.copy(baseMesh.position);

                        if (!mesh.userData.isGrinda) {
                            mesh.visible = baseMesh.visible;
                        }

                    }
                }
            });
        }
    });
    updateLastFrameBeams();
});

//Animatie
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

//Resize fereastra
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});