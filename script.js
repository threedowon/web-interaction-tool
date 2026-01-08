// Scene setup
let scene, camera, renderer, controls;
let currentObject = null;
let rotationAngle = 35;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

// Initialize Three.js scene
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 0, 5);

    // Renderer
    const canvas = document.getElementById('canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Controls (optional - using custom mouse controls instead)
    controls = null;
    try {
        if (typeof THREE.OrbitControls !== 'undefined' && THREE.OrbitControls) {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.enableZoom = true;
            controls.enablePan = false;
        }
    } catch (e) {
        console.log('OrbitControls not available, using custom controls');
    }

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    const spotLight = new THREE.SpotLight(0xffffff, 1);
    spotLight.position.set(5, 5, 5);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 2048;
    spotLight.shadow.mapSize.height = 2048;
    scene.add(spotLight);

    // Create initial cube
    createCube();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Mouse controls for rotation
    setupMouseControls();

    // Update date
    updateDate();

    // Start animation loop
    animate();
}

// Create cube
function createCube() {
    if (currentObject) {
        scene.remove(currentObject);
    }

    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({ color: 0xe0e0e0 });
    currentObject = new THREE.LineSegments(edges, material);
    currentObject.rotation.y = THREE.MathUtils.degToRad(rotationAngle);
    scene.add(currentObject);
}

// Create sphere
function createSphere() {
    if (currentObject) {
        scene.remove(currentObject);
    }

    const geometry = new THREE.SphereGeometry(1.5, 32, 32);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({ color: 0xe0e0e0 });
    currentObject = new THREE.LineSegments(edges, material);
    currentObject.rotation.y = THREE.MathUtils.degToRad(rotationAngle);
    scene.add(currentObject);
}

// Create cone
function createCone() {
    if (currentObject) {
        scene.remove(currentObject);
    }

    const geometry = new THREE.ConeGeometry(1.5, 3, 32);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({ color: 0xe0e0e0 });
    currentObject = new THREE.LineSegments(edges, material);
    currentObject.rotation.y = THREE.MathUtils.degToRad(rotationAngle);
    scene.add(currentObject);
}

// Create cylinder
function createCylinder() {
    if (currentObject) {
        scene.remove(currentObject);
    }

    const geometry = new THREE.CylinderGeometry(1.5, 1.5, 3, 32);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({ color: 0xe0e0e0 });
    currentObject = new THREE.LineSegments(edges, material);
    currentObject.rotation.y = THREE.MathUtils.degToRad(rotationAngle);
    scene.add(currentObject);
}

// Create torus
function createTorus() {
    if (currentObject) {
        scene.remove(currentObject);
    }

    const geometry = new THREE.TorusGeometry(1.5, 0.5, 16, 100);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({ color: 0xe0e0e0 });
    currentObject = new THREE.LineSegments(edges, material);
    currentObject.rotation.y = THREE.MathUtils.degToRad(rotationAngle);
    scene.add(currentObject);
}

// Setup mouse controls
function setupMouseControls() {
    const canvas = document.getElementById('canvas');
    
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging && currentObject) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            currentObject.rotation.y += deltaX * 0.01;
            currentObject.rotation.x += deltaY * 0.01;
            
            rotationAngle = THREE.MathUtils.radToDeg(currentObject.rotation.y);
            updateRotationDisplay();
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });
}

// Update rotation display
function updateRotationDisplay() {
    const rotationValue = document.getElementById('rotation-value');
    rotationValue.textContent = Math.round(rotationAngle) + '°';
}

// Form buttons
document.querySelectorAll('.form-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.form-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const shape = btn.dataset.shape;
        switch(shape) {
            case 'cube':
                createCube();
                break;
            case 'sphere':
                createSphere();
                break;
            case 'cone':
                createCone();
                break;
            case 'cylinder':
                createCylinder();
                break;
            case 'torus':
                createTorus();
                break;
        }
    });
});

// Tool buttons
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const tool = btn.dataset.tool;
        console.log('Tool selected:', tool);
        // Add tool-specific functionality here
    });
});

// Lightning buttons
document.querySelectorAll('.lightning-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.lightning-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const lightType = btn.dataset.light;
        updateLighting(lightType);
    });
});

// Update lighting
function updateLighting(lightType) {
    // Remove existing lights (except ambient)
    const lightsToRemove = [];
    scene.children.forEach(child => {
        if (child instanceof THREE.SpotLight || 
            child instanceof THREE.DirectionalLight || 
            child instanceof THREE.PointLight ||
            child instanceof THREE.RectAreaLight) {
            lightsToRemove.push(child);
        }
    });
    lightsToRemove.forEach(light => scene.remove(light));

    // Add new light based on type
    let newLight;
    switch(lightType) {
        case 'spot':
            newLight = new THREE.SpotLight(0xffffff, 1);
            newLight.position.set(5, 5, 5);
            newLight.castShadow = true;
            break;
        case 'area':
            newLight = new THREE.RectAreaLight(0xffffff, 1, 5, 5);
            newLight.position.set(0, 5, 0);
            break;
        case 'target':
            newLight = new THREE.PointLight(0xffffff, 1);
            newLight.position.set(0, 5, 5);
            break;
        case 'sun':
            newLight = new THREE.DirectionalLight(0xffffff, 1);
            newLight.position.set(5, 10, 5);
            newLight.castShadow = true;
            break;
    }
    
    if (newLight) {
        scene.add(newLight);
    }
}

// Brightness slider
const brightnessSlider = document.getElementById('brightness-slider');
const brightnessValue = document.getElementById('brightness-value');

brightnessSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    brightnessValue.textContent = value;
    
    // Update ambient light intensity
    scene.children.forEach(child => {
        if (child instanceof THREE.AmbientLight) {
            child.intensity = value / 100 * 0.5;
        }
    });
});

// Shadow density slider
const shadowSlider = document.getElementById('shadow-slider');
const shadowValue = document.getElementById('shadow-value');

shadowSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    shadowValue.textContent = value;
    
    // Update shadow opacity (if using shadow materials)
    // This is a simplified implementation
    console.log('Shadow density:', value);
});

// Update date
function updateDate() {
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];
    
    const dayName = days[now.getDay()];
    const day = now.getDate();
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    
    document.getElementById('current-date').textContent = `${dayName} — ${day} ${month}`;
    document.getElementById('current-year').textContent = year;
}

// Window resize handler
function onWindowResize() {
    const canvas = document.getElementById('canvas');
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    if (controls) {
        controls.update();
    }
    
    // Auto-rotate when not dragging (disabled for better manual control)
    // if (currentObject && !isDragging && (!controls || !controls.enabled)) {
    //     currentObject.rotation.y += 0.005;
    //     rotationAngle = THREE.MathUtils.radToDeg(currentObject.rotation.y);
    //     updateRotationDisplay();
    // }
    
    renderer.render(scene, camera);
}

// Initialize when page loads
window.addEventListener('load', init);

