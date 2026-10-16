(() => {
        const list = document.getElementById("list"),
          search = document.getElementById("search"),
          format = document.getElementById("format"),
          sort = document.getElementById("sort"),
          count = document.getElementById("count"),
          updated = document.getElementById("updated");
        let matches = [];
        const esc = (v) =>
          String(v ?? "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
          );
        const fmt = (m) => {
          const text = [m.title, m.match_short_name, m.name, m.class?.map((x) => x.name).join(" ")]
            .join(" ")
            .toLowerCase();
          if (/test|first-class/.test(text)) return "Test";
          if (/odi|one.day|one day/.test(text)) return "ODI";
          if (/t20|twenty20/.test(text)) return "T20I";
          if (/women/.test(text)) return "Women's";
          return "Other";
        };
        const date = (m) => m.start_date || m.end_date || m.date_string || "";
        function render() {
          const q = search.value.trim().toLowerCase(),
            f = format.value;
          const data = matches.filter((m) => {
            const hay = [
              m.name,
              m.title,
              m.match_short_name,
              m.comp_name,
              m.ground_name,
              m.team1_name,
              m.team2_name,
              m.result_string,
            ]
              .join(" ")
              .toLowerCase();
            return (!q || hay.includes(q)) && (f === "all" || fmt(m) === f);
          });
          data.sort((a, b) => {
            const d = date(a).localeCompare(date(b));
            return sort.value === "new" ? -d : d;
          });
          count.textContent = data.length + " result" + (data.length === 1 ? "" : "s");
          if (!data.length) {
            list.innerHTML =
              '<div class="empty">No completed results saved yet. The archive fills when the BCCI feed marks matches complete.</div>';
            return;
          }
          list.innerHTML = data
            .map((m) => {
              const gid = m.gid || m.match_id || "",
                teams =
                  (m.team1_name || m.team1_short_name || "Team 1") +
                  " vs " +
                  (m.team2_name || m.team2_short_name || "Team 2");
              const summary = m.summary?.team || [];
              const scores = summary
                .map((t) => t.score)
                .filter(Boolean)
                .join(" · ");
              return (
                '<article class="match"><div><div class="meta">' +
                esc(m.comp_name || m.comp_type || "Cricket") +
                " · " +
                esc(m.title || m.match_short_name || fmt(m)) +
                " · " +
                esc(m.date_string || date(m)) +
                '</div><div class="teams">' +
                esc(teams) +
                '</div><div class="result">' +
                esc(m.result_string || "Match completed") +
                "</div>" +
                (scores ? '<div class="score">' + esc(scores) + "</div>" : "") +
                '<div class="score">' +
                esc(m.ground_name || m.ground_city || "") +
                '</div></div><div class="actions">' +
                (gid
                  ? '<a class="btn" href="../bcci-scorecard-page.html?gid=' +
                    encodeURIComponent(gid) +
                    '">Scoreboard ↗</a>'
                  : "") +
                "</div></article>"
              );
            })
            .join("");
        }
        fetch("./results.json", { cache: "no-store" })
          .then((r) => {
            if (!r.ok) throw Error("Results data is not available yet");
            return r.json();
          })
          .then((data) => {
            matches = Array.isArray(data.matches) ? data.matches : [];
            updated.textContent = data.updatedAt
              ? "Updated " + new Date(data.updatedAt).toLocaleString()
              : "";
            render();
          })
          .catch(() => {
            count.textContent = "Results archive";
            list.innerHTML =
              '<div class="empty">Results data has not been generated yet. It will appear after the next successful BCCI fixtures refresh.</div>';
          });
        [search, format, sort].forEach((el) => el.addEventListener("input", render));
      })();
