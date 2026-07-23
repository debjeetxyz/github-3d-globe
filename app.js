const username = "debjeetxyz";
const joiningDate = new Date("2026-07-09");

let isAutoSpinning = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 3.5;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const earthSystem = new THREE.Group();
scene.add(earthSystem);

const tiltedAxisGroup = new THREE.Group();
tiltedAxisGroup.rotation.z = THREE.MathUtils.degToRad(-23.5);
earthSystem.add(tiltedAxisGroup);

const radius = 1.2;
const poleCapGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.4, 16);
const poleMat = new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.8 });

const northAxis = new THREE.Mesh(poleCapGeo, poleMat);
northAxis.position.set(0, radius + 0.2, 0);
tiltedAxisGroup.add(northAxis);

const southAxis = new THREE.Mesh(poleCapGeo, poleMat);
southAxis.position.set(0, -(radius + 0.2), 0);
tiltedAxisGroup.add(southAxis);

const globeBody = new THREE.Group();
tiltedAxisGroup.add(globeBody);

const contributionColors = [0x161b22, 0x0e4429, 0x006d32, 0x26a641, 0x39d353];

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const interactiveMeshes = [];

interactiveMeshes.push(northAxis);
interactiveMeshes.push(southAxis);

async function fetchGitHubData() {
    try {
        const userRes = await fetch(`https://api.github.com/users/${username}`);
        const userData = await userRes.json();
        document.getElementById('live-stats').innerHTML = `Public Repos: <strong>${userData.public_repos || 0}</strong> | Followers: <strong>${userData.followers || 0}</strong>`;

        const response = await fetch(`https://github-contributions-api.jogruber.de/v4/${username}?y=last`);
        const data = await response.json();
        
        let totalFilteredCount = 0;

        data.contributions.forEach((day, index) => {
            const dayDate = new Date(day.date);
            const isAfterJoining = dayDate >= joiningDate;

            const level = isAfterJoining ? (day.level || 0) : 0;
            const count = isAfterJoining ? (day.count || 0) : 0;
            
            if (isAfterJoining) totalFilteredCount += count;

            const color = contributionColors[level];
            const weekIndex = Math.floor(index / 7);
            const dayIndex = index % 7;

            if (weekIndex >= 53) return;

            const theta = (weekIndex / 53) * Math.PI * 2;
            const phi = ((dayIndex + 1) / 8) * Math.PI;

            const boxGeo = new THREE.BoxGeometry(0.04, 0.04, 0.02);
            const boxMat = new THREE.MeshBasicMaterial({ color: color });
            const cell = new THREE.Mesh(boxGeo, boxMat);

            const currentRadius = radius + (level * 0.005);
            cell.position.set(
                currentRadius * Math.sin(phi) * Math.cos(theta),
                currentRadius * Math.cos(phi),
                currentRadius * Math.sin(phi) * Math.sin(theta)
            );

            cell.lookAt(0, 0, 0);
            cell.userData = { date: day.date, count: count, active: isAfterJoining, type: 'cell' };
            
            interactiveMeshes.push(cell);
            globeBody.add(cell);
        });

        document.getElementById('status-text').innerText = `Contributions since July 9: ${totalFilteredCount}`;
    } catch (error) {
        console.error("API error:", error);
        document.getElementById('status-text').innerText = "Failed to load live data feed.";
    }
}

fetchGitHubData();

const tooltip = document.getElementById('tooltip');
const modal = document.getElementById('commit-modal');
const modalDateTitle = document.getElementById('modal-date-title');
const modalCommitList = document.getElementById('modal-commit-list');
document.getElementById('close-modal').addEventListener('click', () => modal.classList.remove('active'));

function updateMouseCoordinates(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    tooltip.style.left = `${clientX + 15}px`;
    tooltip.style.top = `${clientY + 15}px`;
}

window.addEventListener('mousemove', (e) => {
    updateMouseCoordinates(e.clientX, e.clientY);
});

// Calls your serverless backend route securely for exact day repo/commit activity
async function openLiveDayModal(targetDateStr, totalCount) {
    modalDateTitle.innerText = `Activity on ${targetDateStr}`;
    modalCommitList.innerHTML = `<p style="color: #8b949e;">Fetching exact repos and commits for ${targetDateStr}...</p>`;
    modal.classList.add('active');

    try {
        const res = await fetch(`/api/day-activity?username=${username}&date=${targetDateStr}`);
        const data = await res.json();

        if (data.activities && data.activities.length > 0) {
            let htmlContent = '';
            data.activities.forEach(act => {
                htmlContent += `
                    <div class="commit-item" onclick="window.open('${act.url}', '_blank')">
                        <a>📦 ${act.repo}</a>
                        <p>${act.type}: ${act.title}</p>
                    </div>
                `;
            });
            modalCommitList.innerHTML = htmlContent;
        } else {
            const searchUrl = `https://github.com/search?q=author%3A${username}+committer-date%3A${targetDateStr}&type=commits`;
            modalCommitList.innerHTML = `
                <div class="commit-item" onclick="window.open('${searchUrl}', '_blank')">
                    <a>🔍 View Commits on GitHub (${targetDateStr})</a>
                    <p>${totalCount} contribution(s) recorded. Click to view matching code commits.</p>
                </div>
            `;
        }
    } catch (err) {
        modalCommitList.innerHTML = `
            <div class="commit-item" onclick="window.open('https://github.com/${username}?tab=repositories', '_blank')">
                <a>Open GitHub Profile</a>
                <p>${totalCount} contribution(s) recorded on ${targetDateStr}.</p>
            </div>
        `;
    }
}

window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#ui-overlay') || e.target.closest('#commit-modal')) return;
    updateMouseCoordinates(e.clientX, e.clientY);

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveMeshes);

    if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData.type === 'cell' && hit.userData.active && hit.userData.count > 0) {
            openLiveDayModal(hit.userData.date, hit.userData.count);
        }
    } else {
        isAutoSpinning = !isAutoSpinning;
    }
});

let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#commit-modal')) return;
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
});

window.addEventListener('pointerup', () => { isDragging = false; });
window.addEventListener('pointercancel', () => { isDragging = false; });

window.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;

    earthSystem.rotation.y += deltaX * 0.005;
    earthSystem.rotation.x += deltaY * 0.005;

    previousMousePosition = { x: e.clientX, y: e.clientY };
});

const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (!isDragging && isAutoSpinning) {
        globeBody.rotation.y += ((2 * Math.PI) / 10.0) * delta;
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveMeshes);

    if (intersects.length > 0 && !modal.classList.contains('active')) {
        const hit = intersects[0].object;
        tooltip.style.display = 'block';
        if (hit === northAxis || hit === southAxis) {
            tooltip.innerHTML = `<strong>Rotational Axis Pole</strong><br>Click background to toggle spin`;
        } else if (hit.userData.active) {
            tooltip.innerHTML = `<strong>Date:</strong> ${hit.userData.date}<br><strong>Contributions:</strong> ${hit.userData.count}`;
        } else {
            tooltip.innerHTML = `<strong>Date:</strong> ${hit.userData.date}<br><span style="color: #8b949e;">Before July 9</span>`;
        }
    } else {
        tooltip.style.display = 'none';
    }

    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
