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

// ---- Moon-ball crater texture setup ----
const BASE_COLOR = 0x0b1320; // smooth "no contribution" surface
const contributionColors = [0x0b1320, 0x0e4429, 0x006d32, 0x26a641, 0x39d353];

const TEX_W = 2048;
const TEX_H = 1024;
const textureCanvas = document.createElement('canvas');
textureCanvas.width = TEX_W;
textureCanvas.height = TEX_H;
const tctx = textureCanvas.getContext('2d');

function toRgb(hex) {
    return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}
function shade(hex, percent) {
    const { r, g, b } = toRgb(hex);
    const nr = Math.min(255, Math.max(0, Math.round(r + (r * percent) / 100)));
    const ng = Math.min(255, Math.max(0, Math.round(g + (g * percent) / 100)));
    const nb = Math.min(255, Math.max(0, Math.round(b + (b * percent) / 100)));
    return `rgb(${nr},${ng},${nb})`;
}
function rgbStr(hex) {
    const { r, g, b } = toRgb(hex);
    return `rgb(${r},${g},${b})`;
}

function paintBaseSurface() {
    // solid base + very subtle vertical vignette so poles read slightly darker (sphere-like shading)
    tctx.fillStyle = rgbStr(BASE_COLOR);
    tctx.fillRect(0, 0, TEX_W, TEX_H);
    const vign = tctx.createLinearGradient(0, 0, 0, TEX_H);
    vign.addColorStop(0, 'rgba(0,0,0,0.35)');
    vign.addColorStop(0.5, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(0,0,0,0.35)');
    tctx.fillStyle = vign;
    tctx.fillRect(0, 0, TEX_W, TEX_H);
}

function drawCraterAt(x, y, r, colorHex, glow) {
    const grad = tctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r);
    grad.addColorStop(0, shade(colorHex, glow ? 55 : 25));
    grad.addColorStop(0.55, rgbStr(colorHex));
    grad.addColorStop(1, shade(colorHex, -55));
    tctx.beginPath();
    tctx.fillStyle = grad;
    tctx.arc(x, y, r, 0, Math.PI * 2);
    tctx.fill();

    // dark inner rim to sell the "hole" depth
    tctx.beginPath();
    tctx.strokeStyle = 'rgba(0,0,0,0.45)';
    tctx.lineWidth = Math.max(1, r * 0.12);
    tctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
    tctx.stroke();

    if (glow) {
        tctx.save();
        tctx.shadowColor = rgbStr(colorHex);
        tctx.shadowBlur = r * 3.2;
        tctx.beginPath();
        tctx.fillStyle = shade(colorHex, 70);
        tctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
        tctx.fill();
        tctx.restore();
    }
}

function drawCrater(x, y, r, colorHex, glow) {
    drawCraterAt(x, y, r, colorHex, glow);
    // handle horizontal wrap so craters near the seam aren't clipped
    if (x - r < 0) drawCraterAt(x + TEX_W, y, r, colorHex, glow);
    if (x + r > TEX_W) drawCraterAt(x - TEX_W, y, r, colorHex, glow);
}

const globeTexture = new THREE.CanvasTexture(textureCanvas);
globeTexture.wrapS = THREE.RepeatWrapping;
globeTexture.wrapT = THREE.ClampToEdgeWrapping;

const globeGeo = new THREE.SphereGeometry(radius, 96, 96);
const globeMat = new THREE.MeshBasicMaterial({ map: globeTexture });
const globeMesh = new THREE.Mesh(globeGeo, globeMat);
globeBody.add(globeMesh);

paintBaseSurface();
globeTexture.needsUpdate = true;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const interactiveMeshes = [northAxis, southAxis, globeMesh];

let cellsData = []; // flat array indexed like the original `index` (weekIndex*7 + dayIndex)
let hoveredIndex = -1;

const CELL_W = TEX_W / 53;
const CELL_H = TEX_H / 8;

async function fetchGitHubData() {
    try {
        const userRes = await fetch(`https://api.github.com/users/${username}`);
        const userData = await userRes.json();
        document.getElementById('live-stats').innerHTML = `Public Repos: <strong>${userData.public_repos || 0}</strong> | Followers: <strong>${userData.followers || 0}</strong>`;

        const response = await fetch(`https://github-contributions-api.jogruber.de/v4/${username}?y=last`);
        const data = await response.json();

        let totalFilteredCount = 0;
        cellsData = [];

        paintBaseSurface();

        data.contributions.forEach((day, index) => {
            const dayDate = new Date(day.date);
            const isAfterJoining = dayDate >= joiningDate;

            const level = isAfterJoining ? (day.level || 0) : 0;
            const count = isAfterJoining ? (day.count || 0) : 0;

            if (isAfterJoining) totalFilteredCount += count;

            const weekIndex = Math.floor(index / 7);
            const dayIndex = index % 7;

            cellsData[index] = { date: day.date, count, level, active: isAfterJoining, weekIndex, dayIndex };

            if (weekIndex >= 53) return;

            const x = weekIndex * CELL_W + CELL_W / 2;
            const y = (dayIndex + 1) * CELL_H;

            if (level > 0) {
                const craterRadius = (Math.min(CELL_W, CELL_H) * 0.38) * (0.75 + level * 0.12);
                drawCrater(x, y, craterRadius, contributionColors[level], false);
            }
        });

        globeTexture.needsUpdate = true;
        document.getElementById('status-text').innerText = `Contributions since July 9: ${totalFilteredCount}`;
    } catch (error) {
        console.error("API error:", error);
        document.getElementById('status-text').innerText = "Failed to load live data feed.";
    }
}

fetchGitHubData();

// ---- Redraw helper for hover highlight ----
function redrawCell(index, glow) {
    const cell = cellsData[index];
    if (!cell || cell.weekIndex >= 53) return;
    const x = cell.weekIndex * CELL_W + CELL_W / 2;
    const y = (cell.dayIndex + 1) * CELL_H;

    if (cell.level > 0) {
        const baseRadius = (Math.min(CELL_W, CELL_H) * 0.38) * (0.75 + cell.level * 0.12);
        const r = glow ? baseRadius * 1.35 : baseRadius;
        // clear a slightly larger patch back to base before redrawing (removes old glow bleed)
        const clearR = baseRadius * 1.7;
        tctx.save();
        tctx.beginPath();
        tctx.arc(x, y, clearR, 0, Math.PI * 2);
        tctx.clip();
        tctx.fillStyle = rgbStr(BASE_COLOR);
        tctx.fillRect(x - clearR, y - clearR, clearR * 2, clearR * 2);
        tctx.restore();
        drawCrater(x, y, r, contributionColors[cell.level], glow);
    }
    globeTexture.needsUpdate = true;
}

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

// Converts a local-space point on the globe into a week/day cell index
function pointToCellIndex(localPoint) {
    const r = localPoint.length();
    const phi = Math.acos(THREE.MathUtils.clamp(localPoint.y / r, -1, 1)); // 0..PI
    let theta = Math.atan2(localPoint.z, localPoint.x); // -PI..PI
    if (theta < 0) theta += Math.PI * 2;

    let weekIndex = Math.round((theta / (Math.PI * 2)) * 53) % 53;
    let dayIndex = Math.round((phi / Math.PI) * 8) - 1;

    if (dayIndex < 0 || dayIndex > 6) return -1;
    return weekIndex * 7 + dayIndex;
}

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
        const hit = intersects[0];
        if (hit.object === globeMesh) {
            const localPoint = globeMesh.worldToLocal(hit.point.clone());
            const cellIndex = pointToCellIndex(localPoint);
            const cell = cellsData[cellIndex];
            if (cell && cell.active && cell.count > 0) {
                openLiveDayModal(cell.date, cell.count);
                return;
            }
        }
        // hit a pole, or an inactive/empty patch of the ball - no toggle
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

    let newHoveredIndex = -1;
    let hoveredCell = null;
    let onPole = null;

    if (intersects.length > 0 && !modal.classList.contains('active')) {
        const hit = intersects[0];
        if (hit.object === northAxis || hit.object === southAxis) {
            onPole = hit.object;
        } else if (hit.object === globeMesh) {
            const localPoint = globeMesh.worldToLocal(hit.point.clone());
            const cellIndex = pointToCellIndex(localPoint);
            const cell = cellsData[cellIndex];
            if (cell && cell.level > 0) {
                newHoveredIndex = cellIndex;
                hoveredCell = cell;
            } else if (cell) {
                hoveredCell = cell;
            }
        }
    }

    // Only touch the canvas texture when the hovered crater actually changes
    if (newHoveredIndex !== hoveredIndex) {
        if (hoveredIndex !== -1) redrawCell(hoveredIndex, false);
        if (newHoveredIndex !== -1) redrawCell(newHoveredIndex, true);
        hoveredIndex = newHoveredIndex;
    }

    if (onPole) {
        tooltip.style.display = 'block';
        tooltip.innerHTML = `<strong>Rotational Axis Pole</strong><br>Click background to toggle spin`;
    } else if (hoveredCell) {
        tooltip.style.display = 'block';
        if (hoveredCell.active) {
            tooltip.innerHTML = `<strong>Date:</strong> ${hoveredCell.date}<br><strong>Contributions:</strong> ${hoveredCell.count}`;
        } else {
            tooltip.innerHTML = `<strong>Date:</strong> ${hoveredCell.date}<br><span style="color: #8b949e;">Before July 9</span>`;
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