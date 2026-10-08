(() => {
  if (window.__candyUnicornLoaded) return;
  window.__candyUnicornLoaded = true;

  const ASPECT = 296 / 360; // height / width of unicorn.webp
  const COLORS = ["#ff4fa3", "#ff8a00", "#ffd23f", "#3ddc84", "#3fa7ff", "#9b5cff", "#ff5e5e", "#ff9ad5"];
  const SHAPES = ["swirl", "wrapped", "star", "heart", "bean", "sprinkle"];
  let flying = false;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "CU_FLY") {
      fly(Boolean(msg.force));
      sendResponse({ ok: true });
    }
  });

  function hostExcluded(list) {
    const h = location.hostname.replace(/^www\./, "");
    return (list || []).some((x) => {
      const d = String(x).trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      return d && (h === d || h.endsWith("." + d));
    });
  }

  async function fly(force) {
    if (flying) return;
    const s = await chrome.storage.sync.get(self.CU_DEFAULTS);
    if (!force) {
      if (!s.enabled) return;
      if (document.visibilityState !== "visible") return;
      if (hostExcluded(s.excluded)) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    }
    flying = true;
    try {
      await run(s);
    } finally {
      flying = false;
    }
  }

  function run(s) {
    return new Promise((resolve) => {
      // Overlay in a closed shadow root so page styles never touch it.
      const host = document.createElement("div");
      host.style.cssText =
        "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;contain:strict;";
      const root = host.attachShadow({ mode: "closed" });
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
      const img = document.createElement("img");
      img.alt = "";
      img.src = chrome.runtime.getURL("unicorn.webp");
      const w = Math.max(80, Number(s.size) || 240);
      const h = w * ASPECT;
      img.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;will-change:transform;transform:translate(-9999px,0);`;
      root.append(canvas, img);
      document.documentElement.appendChild(host);

      const ctx = canvas.getContext("2d");
      let vw = 0, vh = 0;
      const resize = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        vw = window.innerWidth;
        vh = window.innerHeight;
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      resize();
      window.addEventListener("resize", resize);

      const duration = Math.max(2, Number(s.speed) || 7) * 1000;
      const baseY = vh * (0.12 + Math.random() * 0.4) - h / 2;
      const bobAmp = Math.min(28, vh * 0.03);

      // Firework launch times spread across the flight.
      const count = s.fireworks ? Math.max(0, Math.min(100, Number(s.fireworkCount) || 0)) : 0;
      const launches = [];
      for (let i = 0; i < count; i++) {
        launches.push(((i + Math.random() * 0.8) / Math.max(1, count)) * duration * 0.92);
      }
      launches.sort((a, b) => a - b);

      const rockets = [];
      const particles = [];
      let next = 0;
      let t0 = null;
      let last = null;

      const finish = () => {
        window.removeEventListener("resize", resize);
        host.remove();
        resolve();
      };

      const start = () => requestAnimationFrame(frame);
      img.decode ? img.decode().then(start, start) : (img.onload = start);

      function frame(now) {
        if (t0 === null) { t0 = now; last = now; }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const elapsed = now - t0;
        const p = elapsed / duration;

        // Unicorn position: left to right, gentle bob and tilt.
        let ux = null, uy = null;
        if (p <= 1) {
          const phase = (elapsed / 1000) * Math.PI * 2 * 0.9;
          ux = -w + p * (vw + w);
          uy = baseY + Math.sin(phase) * bobAmp;
          const rot = Math.cos(phase) * -4;
          img.style.transform = `translate(${ux}px,${uy}px) rotate(${rot}deg)`;
          if (s.trail) spawnTrail(ux + w * 0.1, uy + h * 0.5);
        } else {
          img.style.transform = "translate(-9999px,0)";
        }

        while (next < launches.length && elapsed >= launches[next]) {
          launchRocket();
          next++;
        }

        ctx.clearRect(0, 0, vw, vh);
        updateRockets(dt);
        updateParticles(dt);

        const done = p > 1 && next >= launches.length && rockets.length === 0 && particles.length === 0;
        if (done) finish();
        else requestAnimationFrame(frame);
      }

      function rand(a, b) { return a + Math.random() * (b - a); }
      function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

      function spawnTrail(x, y) {
        for (let i = 0; i < 2; i++) {
          particles.push({
            kind: "spark",
            x: x + rand(-6, 6), y: y + rand(-h * 0.15, h * 0.15),
            vx: rand(-80, -20), vy: rand(-20, 40),
            g: 30, drag: 0.9, life: rand(0.6, 1.0), age: 0,
            size: rand(2.5, 5), rot: rand(0, 6.28), spin: rand(-4, 4),
            color: pick(COLORS)
          });
        }
      }

      function launchRocket() {
        const x = rand(vw * 0.06, vw * 0.94);
        const ty = rand(vh * 0.1, vh * 0.55);
        const t = rand(0.55, 0.85);
        rockets.push({ x, y: vh + 10, ty, vy: -(vh + 10 - ty) / t, color: pick(COLORS), trail: [] });
      }

      function updateRockets(dt) {
        for (let i = rockets.length - 1; i >= 0; i--) {
          const r = rockets[i];
          r.trail.push([r.x, r.y]);
          if (r.trail.length > 8) r.trail.shift();
          r.y += r.vy * dt;
          r.x += Math.sin(r.y * 0.05) * 0.4;
          ctx.save();
          ctx.lineCap = "round";
          for (let k = 1; k < r.trail.length; k++) {
            ctx.globalAlpha = k / r.trail.length * 0.8;
            ctx.strokeStyle = r.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(r.trail[k - 1][0], r.trail[k - 1][1]);
            ctx.lineTo(r.trail[k][0], r.trail[k][1]);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(r.x, r.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          if (r.y <= r.ty) {
            explode(r.x, r.y);
            rockets.splice(i, 1);
          }
        }
      }

      function explode(x, y) {
        // Bright flash ring.
        particles.push({ kind: "ring", x, y, life: 0.45, age: 0, color: pick(COLORS) });
        const n = 26 + ((Math.random() * 10) | 0);
        const power = rand(160, 260);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rand(-0.15, 0.15);
          const sp = power * rand(0.55, 1.05);
          particles.push({
            kind: pick(SHAPES),
            x, y,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            g: 260, drag: 0.985, life: rand(1.3, 2.0), age: 0,
            size: rand(9, 14), rot: rand(0, 6.28), spin: rand(-6, 6),
            color: pick(COLORS), color2: pick(COLORS)
          });
        }
      }

      function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
          const q = particles[i];
          q.age += dt;
          if (q.age >= q.life) { particles.splice(i, 1); continue; }
          const k = q.age / q.life;
          if (q.kind === "ring") {
            ctx.save();
            ctx.globalAlpha = (1 - k) * 0.7;
            ctx.strokeStyle = q.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(q.x, q.y, 8 + k * 60, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            continue;
          }
          const f = Math.pow(q.drag, dt * 60);
          q.vx *= f; q.vy = q.vy * f + q.g * dt;
          q.x += q.vx * dt; q.y += q.vy * dt;
          q.rot += q.spin * dt;
          const alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
          drawShape(q, alpha);
        }
      }

      function drawShape(q, alpha) {
        const s = q.size;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillStyle = q.color;
        switch (q.kind) {
          case "spark": starPath(q.size, 4); ctx.fill(); break;
          case "star": starPath(s * 0.9, 5); ctx.fill(); outline(); break;
          case "heart": heartPath(s); ctx.fill(); outline(); break;
          case "swirl": {
            ctx.beginPath(); ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2);
            ctx.fillStyle = "#fff"; ctx.fill();
            ctx.fillStyle = q.color;
            for (let j = 0; j < 4; j++) {
              ctx.beginPath(); ctx.moveTo(0, 0);
              ctx.arc(0, 0, s * 0.75, (j * Math.PI) / 2, (j * Math.PI) / 2 + Math.PI / 4);
              ctx.closePath(); ctx.fill();
            }
            ctx.beginPath(); ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2); outline();
            break;
          }
          case "wrapped": {
            ctx.fillStyle = q.color2;
            ctx.beginPath(); ctx.moveTo(-s * 0.55, 0); ctx.lineTo(-s * 1.05, -s * 0.4); ctx.lineTo(-s * 1.05, s * 0.4); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(s * 0.55, 0); ctx.lineTo(s * 1.05, -s * 0.4); ctx.lineTo(s * 1.05, s * 0.4); ctx.closePath(); ctx.fill();
            ctx.fillStyle = q.color;
            ctx.beginPath(); ctx.ellipse(0, 0, s * 0.62, s * 0.45, 0, 0, Math.PI * 2); ctx.fill(); outline();
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.beginPath(); ctx.ellipse(-s * 0.18, -s * 0.16, s * 0.18, s * 0.09, -0.4, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case "bean": {
            roundRect(-s * 0.7, -s * 0.35, s * 1.4, s * 0.7, s * 0.35); ctx.fill(); outline();
            ctx.fillStyle = "rgba(255,255,255,0.65)";
            ctx.beginPath(); ctx.ellipse(-s * 0.25, -s * 0.12, s * 0.22, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case "sprinkle": roundRect(-s * 0.6, -s * 0.14, s * 1.2, s * 0.28, s * 0.14); ctx.fill(); break;
        }
        ctx.restore();
      }

      function outline() {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.stroke();
      }

      function starPath(r, points) {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
          const rr = i % 2 === 0 ? r : r * 0.45;
          const a = (i * Math.PI) / points - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
      }

      function heartPath(s) {
        ctx.beginPath();
        ctx.moveTo(0, s * 0.35);
        ctx.bezierCurveTo(-s * 0.9, -s * 0.25, -s * 0.45, -s * 0.85, 0, -s * 0.35);
        ctx.bezierCurveTo(s * 0.45, -s * 0.85, s * 0.9, -s * 0.25, 0, s * 0.35);
        ctx.closePath();
      }

      function roundRect(x, y, w2, h2, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w2, y, x + w2, y + h2, r);
        ctx.arcTo(x + w2, y + h2, x, y + h2, r);
        ctx.arcTo(x, y + h2, x, y, r);
        ctx.arcTo(x, y, x + w2, y, r);
        ctx.closePath();
      }
    });
  }
})();
