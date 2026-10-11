(async function () {
  const $ = (s) => document.querySelector(s);
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "—";
  };
  const esc = (value) =>
    String(value ?? "—").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  const latestTimestamp = (...values) =>
    values
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => ({ value, time: Date.parse(value.replace(" UTC", "Z").replace(" ", "T")) }))
      .filter((item) => Number.isFinite(item.time))
      .sort((a, b) => b.time - a.time)[0]?.value || "time unavailable";
  set("year", new Date().getFullYear());
  const menuButton = $(".menu-toggle"),
    nav = $("#main-nav");
  menuButton?.setAttribute("aria-expanded", "false");
  menuButton?.addEventListener("click", () => {
    const open = nav?.classList.toggle("open") || false;
    menuButton.setAttribute("aria-expanded", String(open));
  });
  nav?.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuButton?.setAttribute("aria-expanded", "false");
    }),
  );
  try {
    const data = await window.TilakSiteData.load();
    const stats = data.careerStats || {};
    const profile = data.profile || {};
    const photo = document.getElementById("tilak-photo");
    const photoFallback = document.querySelector("#profile .photo-fallback");
    if (photo) {
      const fallbackPhoto = photo.getAttribute("src");
      photo.addEventListener("error", () => {
        if (
          photo.dataset.fallbackAttempted !== "true" &&
          fallbackPhoto &&
          photo.src !== fallbackPhoto
        ) {
          photo.dataset.fallbackAttempted = "true";
          photo.src = fallbackPhoto;
          return;
        }
        photo.style.display = "none";
        photoFallback?.classList.add("is-visible");
      });
      if (profile.photo && profile.photo !== fallbackPhoto) photo.src = profile.photo;
    }
    const profileSet = (id, value, fallback = "—") => set(id, value || fallback);
    const nameNode = document.getElementById("profile-name");
    if (nameNode && profile.name) {
      const parts = String(profile.name).trim().split(/\s+/);
      nameNode.replaceChildren();
      nameNode.append(document.createTextNode((parts.shift() || "TILAK").toUpperCase() + " "));
      const surname = document.createElement("em");
      surname.textContent = parts.join(" ").toUpperCase() || "VARMA";
      nameNode.append(surname);
    }
    profileSet("profile-jersey", profile.jerseyNumber, "72");
    profileSet("profile-born", profile.born, "—");
    profileSet("profile-role", profile.role, "Batter");
    profileSet("profile-batting", profile.battingStyle, "—");
    profileSet("profile-bowling", profile.bowlingStyle, "—");
    profileSet("profile-birthplace", profile.birthplace, "Hyderabad, India");
    profileSet(
      "profile-intro",
      profile.role && profile.battingStyle
        ? profile.battingStyle +
            " " +
            profile.role.toLowerCase() +
            " representing India and Mumbai Indians."
        : "India international cricketer and Mumbai Indians batter.",
      "India international cricketer.",
    );
    const safeExternalUrl = (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.href : "";
      } catch {
        return "";
      }
    };
    const setExternalLink = (id, value) => {
      const link = document.getElementById(id);
      const href = safeExternalUrl(value);
      if (!link) return;
      if (href) {
        link.href = href;
        link.removeAttribute("aria-disabled");
      } else {
        link.removeAttribute("href");
        link.setAttribute("aria-disabled", "true");
      }
    };
    const teamHost = document.getElementById("profile-team-chips");
    const teams = Array.isArray(profile.teams)
      ? [...new Set(profile.teams.filter((team) => typeof team === "string" && team.trim()))]
      : [];
    if (teamHost && teams.length) {
      const teamClass = (team) => {
        const key = team.toLowerCase();
        if (key === "india") return " team-india";
        if (key === "mumbai indians") return " team-mi";
        if (key === "medak falcons") return " team-medak";
        return "";
      };
      teamHost.replaceChildren();
      teams.forEach((team) => {
        const chip = document.createElement("span");
        chip.className = "profile-team-chip" + teamClass(team);
        if (team.toLowerCase() === "india") {
          const mark = document.createElement("i");
          mark.setAttribute("aria-hidden", "true");
          mark.textContent = "✦";
          chip.append(mark, document.createTextNode(" " + team.toUpperCase()));
        } else chip.textContent = team.toUpperCase();
        teamHost.append(chip);
      });
      profileSet("profile-teams-count", teams.length + (teams.length === 1 ? " TEAM" : " TEAMS"));
    }
    const profileStamp = document.getElementById("profile-data-updated");
    if (profileStamp) {
      const profileDate = profile.photoCheckedAt || profile.photoUpdated || data.lastUpdated;
      profileStamp.textContent =
        "Profile snapshot: " +
        (profileDate || "date unavailable") +
        " · Site data: " +
        (data.lastUpdated || "date unavailable");
    }
    document.querySelectorAll("[data-stat]").forEach((el) => {
      const key = el.dataset.stat;
      if (stats[key] !== undefined) el.textContent = stats[key];
    });
    set(
      "career-updated",
      "Last update: " +
        latestTimestamp(data.careerStatsUpdated, data.statsguru?.updatedAt, data.lastUpdated),
    );
    const rows = data.recentInnings || [];
    const lastChecked = Date.parse(data.lastChecked || data.lastUpdated || "");
    const stale = !Number.isFinite(lastChecked) || Date.now() - lastChecked > 36 * 60 * 60 * 1000;
    const refreshFailed = data.lastRefreshStatus === "source-unavailable";
    set(
      "data-status",
      !rows.length
        ? "Awaiting feed"
        : refreshFailed
          ? "Saved data retained · retry scheduled"
          : stale
            ? "Stale · last check overdue"
            : "Available · auto-refresh enabled",
    );
    const rankings = data.iccRankings || {};
    set("icc-ranking-t20i", rankings.T20I ? "#" + rankings.T20I : "Not available");
    set("icc-ranking-odi", rankings.ODI ? "#" + rankings.ODI : "Not available");
    set(
      "icc-ranking-updated",
      rankings.updatedAt
        ? "Ranking snapshot · " + rankings.updatedAt
        : "Saved ICC ranking date unavailable",
    );
  } catch (error) {
    set("data-status", "Saved snapshot unavailable");
    const tbody = $("#recent-table");
    if (tbody)
      tbody.innerHTML =
        '<tr><td colspan="7" class="empty">Could not load the saved data. Please try again later.</td></tr>';
  }
})();
