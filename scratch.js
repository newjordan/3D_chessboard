import fs from 'fs';
import * as THREE from 'three';
// We need an environment where GLTFLoader can run... Wait, GLTFLoader needs a DOM/Window.
// We can just use the scene.js and modify the code live, then screenshot.
