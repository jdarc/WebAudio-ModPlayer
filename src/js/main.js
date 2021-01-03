import "../css/main.css"
import ModPlayer from "./modPlayer";

const drawStream = (ctx, stream, position) => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    ctx.fillStyle = "#333355";
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "#AAAAFF";
    ctx.beginPath();
    const dx = stream.length / width;
    for (let x = 0; x < width; ++x) {
        ctx.lineTo(x, (1.5 * stream[x * dx | 0] + 1.0) * height / 2.0);
    }
    ctx.stroke();

    ctx.lineWidth = 1.0;
    ctx.strokeStyle = "#FFFF00";
    ctx.beginPath();
    const cursor = (position * width / stream.length) | 0;
    ctx.moveTo(cursor, 0);
    ctx.lineTo(cursor, height);
    ctx.stroke();
};

window.addEventListener("load", () => {
    const ctxChannel0 = document.getElementById('channel0').getContext('2d');
    const ctxChannel1 = document.getElementById('channel1').getContext('2d');

    let modPlayer;

    const activateAudio = () => {
        modPlayer = new ModPlayer();
        modPlayer.callback = ((position, stream0, stream1) => {
            if (position % 2047 === 0) {
                drawStream(ctxChannel0, stream0, position);
                drawStream(ctxChannel1, stream1, position);
            }
        });
        modPlayer.start();
    };

    const loadSelectedMod = e => {
        if (!modPlayer) activateAudio();
        modPlayer.load(`music/${e.target["alt"].replace(/\s+/g, '-').toLowerCase()}.mod`);
    };

    const images = document.getElementsByTagName("img");
    for (let i = 0; i < images.length; i++) {
        images[i].addEventListener("click", async e => loadSelectedMod(e))
    }

    drawStream(ctxChannel0, new Float32Array(1), 0.5);
    drawStream(ctxChannel1, new Float32Array(1), 0.5);

}, { once: true });
