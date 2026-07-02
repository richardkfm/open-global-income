/**
 * Wireframe globe for the landing page hero.
 * Pure canvas + vanilla JS — no dependency, no WebGL. Draws a graticule
 * (meridians/parallels) plus a simplified world coastline, rotating
 * continuously. Falls back to a single static frame when the visitor
 * has requested reduced motion.
 */
(function () {
  var canvas = document.getElementById('hero-globe');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var prefersReducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  var TILT = -18 * (Math.PI / 180);
  var rotation = 0.4;
  var coastlines = null;

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  // lat/lon in degrees -> unit sphere vector
  function toVector(lat, lon) {
    var latR = toRad(lat);
    var lonR = toRad(lon);
    return {
      x: Math.cos(latR) * Math.cos(lonR),
      y: Math.sin(latR),
      z: Math.cos(latR) * Math.sin(lonR),
    };
  }

  function rotateY(v, theta) {
    var c = Math.cos(theta);
    var s = Math.sin(theta);
    return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
  }

  function rotateX(v, theta) {
    var c = Math.cos(theta);
    var s = Math.sin(theta);
    return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
  }

  function project(lat, lon, size, radius) {
    var v = rotateX(rotateY(toVector(lat, lon), rotation), TILT);
    return {
      x: size / 2 + v.x * radius,
      y: size / 2 - v.y * radius,
      z: v.z,
      visible: v.z > -0.02,
    };
  }

  function strokePolyline(points, size, radius, closed) {
    ctx.beginPath();
    var drawing = false;
    for (var i = 0; i < points.length; i++) {
      var p = project(points[i][0], points[i][1], size, radius);
      if (!p.visible) {
        drawing = false;
        continue;
      }
      if (!drawing) {
        ctx.moveTo(p.x, p.y);
        drawing = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    if (closed && drawing) ctx.closePath();
    ctx.stroke();
  }

  function buildGraticule() {
    var lines = [];
    for (var lon = -180; lon < 180; lon += 20) {
      var meridian = [];
      for (var lat = -90; lat <= 90; lat += 5) meridian.push([lat, lon]);
      lines.push(meridian);
    }
    for (var lat2 = -60; lat2 <= 60; lat2 += 20) {
      var parallel = [];
      for (var lon2 = -180; lon2 <= 180; lon2 += 5) parallel.push([lat2, lon2]);
      lines.push(parallel);
    }
    return lines;
  }

  var graticule = buildGraticule();

  function draw() {
    var size = canvas.width / (window.devicePixelRatio || 1);
    var radius = size * 0.46;
    ctx.clearRect(0, 0, size, size);

    // sphere fill (very light)
    var gradient = ctx.createRadialGradient(
      size / 2 - radius * 0.3,
      size / 2 - radius * 0.3,
      radius * 0.1,
      size / 2,
      size / 2,
      radius,
    );
    gradient.addColorStop(0, 'rgba(59, 100, 168, 0.06)');
    gradient.addColorStop(1, 'rgba(59, 100, 168, 0.02)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    ctx.fill();

    // graticule
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(59, 100, 168, 0.28)';
    for (var i = 0; i < graticule.length; i++) {
      strokePolyline(graticule[i], size, radius, false);
    }

    // coastlines
    if (coastlines) {
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = 'rgba(21, 52, 105, 0.75)';
      for (var j = 0; j < coastlines.length; j++) {
        var poly = coastlines[j];
        var pts = new Array(poly.length);
        for (var k = 0; k < poly.length; k++) pts[k] = [poly[k][1], poly[k][0]];
        strokePolyline(pts, size, radius, false);
      }
    }

    // outer limb
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(21, 52, 105, 0.35)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  function resize() {
    var displaySize = canvas.clientWidth || canvas.parentElement.clientWidth;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function tick() {
    rotation += 0.0028;
    draw();
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  resize();

  fetch('/geo/world-outline.json')
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      coastlines = data;
      draw();
      if (!prefersReducedMotion) requestAnimationFrame(tick);
    })
    .catch(function () {
      // graticule-only globe is still a reasonable fallback
      if (!prefersReducedMotion) requestAnimationFrame(tick);
    });
})();
