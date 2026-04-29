(function () {
  const overlay = document.getElementById('overlay');
  const status = document.getElementById('status');
  let scanning = true;

  const html5QrCode = new Html5Qrcode('reader');

  Html5Qrcode.getCameras()
    .then(cameras => {
      if (!cameras || cameras.length === 0) {
        status.textContent = 'No camera found.';
        return;
      }
      // Prefer rear-facing camera
      const camera = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];
      return html5QrCode.start(
        camera.id,
        { fps: 10, qrbox: { width: 260, height: 160 } },
        onScanSuccess,
        () => {} // suppress per-frame scan errors
      );
    })
    .catch(err => {
      status.textContent = 'Camera access denied. Please allow camera permission and reload.';
      console.error(err);
    });

  async function onScanSuccess(barcode) {
    if (!scanning) return;
    scanning = false;
    html5QrCode.stop().catch(() => {});
    overlay.classList.add('active');

    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode }),
      });
      const data = await res.json();

      if (data.found) {
        const p = data.product;
        const params = new URLSearchParams({
          name: p.name || '',
          brand: p.brand || '',
          image: p.image_url || '',
          barcode: p.barcode || '',
        });
        window.location.href = '/success.html?' + params.toString();
      } else {
        window.location.href = '/not-found.html';
      }
    } catch {
      overlay.classList.remove('active');
      status.textContent = 'Network error. Try again.';
      scanning = true;
      html5QrCode.start(
        null,
        { fps: 10, qrbox: { width: 260, height: 160 }, facingMode: 'environment' },
        onScanSuccess,
        () => {}
      ).catch(() => {});
    }
  }
})();
