(() => {
  "use strict";
  const host = document.getElementById("tilak-video-grid");
  if (!host) return;
  // Official BCCI.tv videos whose titles specifically feature Tilak Varma.
  const videos = [
    {
      title: "Vice-captain Tilak Varma packs a punch with 44(18)",
      category: "Match moment",
      date: "9 Oct 2026",
      duration: "01:42",
      url: "https://www.bcci.tv/videos/s-vice-captain-tilak-varma-packs-a-punch-with-4418-fyxhz5",
    },
    {
      title: "Hat-trick of Sixes: Tilak makes the ball travel",
      category: "Batting highlights",
      date: "9 Oct 2026",
      duration: "01:50",
      url: "https://www.bcci.tv/videos/s-hat-trick-of-sixes-tilak-makes-the-ball-travel-vcfay4",
    },
    {
      title: "50 up in style! Tilak Varma's gorgeous pick up shot",
      category: "Batting highlights",
      date: "11 Dec 2025",
      duration: "BCCI video",
      url: "https://www.bcci.tv/videos/s-50-up-in-style-tilak-varmas-gorgeous-pick-up-shot-0rlxt",
    },
    {
      title: "I wanted to target England's best bowlers: Tilak Varma",
      category: "Interview",
      date: "25 Jan 2025",
      duration: "03:43",
      url: "https://www.bcci.tv/video/5565489/i-wanted-to-target-englands-best-bowlers-tilak-varma",
    },
    {
      title: "Tilak Varma's match-winning knock of 72*(55)",
      category: "Match highlights",
      date: "25 Jan 2025",
      duration: "03:15",
      url: "https://www.bcci.tv/video/5565479/tilak-varma-leading-the-charge-in-the-chase",
    },
  ];
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const validBcciUrl = (value) => {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && u.hostname === "www.bcci.tv" ? u.href : "";
    } catch {
      return "";
    }
  };
  const safeVideos = videos.filter((v) => validBcciUrl(v.url) && /tilak/i.test(v.title));
  if (!safeVideos.length) {
    host.innerHTML =
      '<p class="activity-empty">No verified Tilak videos are available right now.</p>';
    return;
  }
  host.innerHTML = safeVideos
    .map((v) => {
      const url = validBcciUrl(v.url);
      return (
        '<a class="tilak-video-card" href="' +
        esc(url) +
        '" target="_blank" rel="noopener noreferrer" aria-label="Watch ' +
        esc(v.title) +
        ' on official BCCI.tv">' +
        '<div class="tilak-video-art" aria-hidden="true"><span class="tilak-video-number">72</span><span class="tilak-video-play">▶</span><span class="tilak-video-duration">' +
        esc(v.duration) +
        "</span></div>" +
        '<div class="tilak-video-copy"><span class="tilak-video-type">' +
        esc(v.category) +
        ' · BCCI</span><span class="tilak-video-title">' +
        esc(v.title) +
        "</span>" +
        '<span class="tilak-video-meta"><span>' +
        esc(v.date) +
        '</span><span class="tilak-video-watch">WATCH ON BCCI ↗</span></span></div></a>'
      );
    })
    .join("");
})();
