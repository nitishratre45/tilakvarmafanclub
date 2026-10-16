      (() => {
        "use strict";
        const $ = (id) => document.getElementById(id);
        const state = {
          items: [],
          albums: ["General Photos"],
          albumDates: {},
          video: { feedUrl: "" },
        };
        const status = (id, msg, error = false) => {
          const el = $(id);
          if (!el) return;
          el.textContent = msg;
          el.classList.toggle("error", error);
        };
        async function api(url, options = {}) {
          const r = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            ...options,
            headers: { "content-type": "application/json", ...(options.headers || {}) },
          });
          let d = {};
          try {
            d = await r.json();
          } catch {}
          if (!r.ok) throw Error(d.error || "Request failed (" + r.status + ")");
          return d;
        }
        function escapeHtml(s) {
          return String(s ?? "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
          );
        }
        function safeMediaUrl(value) {
          try {
            const u = new URL(value, window.location.origin);
            return u.protocol === "https:" || u.origin === window.location.origin ? u.href : "";
          } catch {
            return "";
          }
        }
        function renderAlbumOptions() {
          ["media-album", "bcci-import-album", "external-photo-album"].forEach((id) => {
            const select = $(id);
            if (!select) return;
            const previous = select.value;
            select.innerHTML = state.albums
              .map(
                (album) =>
                  '<option value="' + escapeHtml(album) + '">' + escapeHtml(album) + "</option>",
              )
              .join("");
            select.value = state.albums.includes(previous)
              ? previous
              : state.albums[0] || "General Photos";
          });
        }

        function updateAlbumOverview() {
          const photoItems = state.items.filter((item) => item.type !== "video");
          const filledAlbums = state.albums.filter((album) =>
            photoItems.some((item) => item.album === album),
          );
          const emptyAlbums = state.albums.length - filledAlbums.length;
          const latest = photoItems
            .filter((item) => item.createdAt && !Number.isNaN(Date.parse(item.createdAt)))
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
          $("album-overview-total").textContent = String(state.albums.length);
          $("album-overview-filled").textContent = String(filledAlbums.length);
          $("album-overview-empty").textContent = String(emptyAlbums);
          $("album-overview-latest").textContent = latest
            ? new Date(latest.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "No uploads yet";
        }

        function renderAlbumManager() {
          const host = $("album-manage-list");
          if (!host) return;
          updateAlbumOverview();
          $("album-manage-count").textContent =
            state.albums.length + (state.albums.length === 1 ? " album" : " albums");
          if (!state.albums.length) {
            host.innerHTML = '<div class="album-manage-empty">No albums created yet.</div>';
            return;
          }
          const query = ($("album-manage-search")?.value || "").trim().toLocaleLowerCase();
          const filter = $("album-manage-filter")?.value || "all";
          const sort = $("album-manage-sort")?.value || "date-desc";
          const countPhotos = (album) =>
            state.items.filter((item) => item.type !== "video" && item.album === album).length;
          let visibleAlbums = state.albums.filter((album) => {
            const count = countPhotos(album);
            return (
              album.toLocaleLowerCase().includes(query) &&
              (filter === "with-photos" ? count > 0 : filter === "empty" ? count === 0 : true)
            );
          });
          if (sort === "date-desc")
            visibleAlbums.sort(
              (a, b) =>
                (state.albumDates[b] || "").localeCompare(state.albumDates[a] || "") ||
                a.localeCompare(b),
            );
          if (sort === "date-asc")
            visibleAlbums.sort(
              (a, b) =>
                (state.albumDates[a] || "").localeCompare(state.albumDates[b] || "") ||
                a.localeCompare(b),
            );
          if (sort === "name") visibleAlbums.sort((a, b) => a.localeCompare(b));
          if (sort === "photos")
            visibleAlbums.sort((a, b) => countPhotos(b) - countPhotos(a) || a.localeCompare(b));
          if (sort === "recent") visibleAlbums = visibleAlbums.reverse();
          if (!visibleAlbums.length) {
            host.innerHTML =
              '<div class="album-manage-empty-state">No albums match. Try another search or filter.</div>';
            return;
          }
          const searching = Boolean(query);
          const pageSize = 3;
          const visibleLimit = searching
            ? visibleAlbums.length
            : window.__galleryAlbumsExpanded
              ? visibleAlbums.length
              : pageSize;
          const pageAlbums = visibleAlbums.slice(0, visibleLimit);
          host.innerHTML = pageAlbums
            .map((album) => {
              const count = state.items.filter(
                (item) => item.type !== "video" && item.album === album,
              ).length;
              return (
                '<div class="album-manage-row"><div class="album-manage-name"><strong>' +
                escapeHtml(album) +
                "</strong><small>" +
                count +
                (count === 1 ? " photo" : " photos") +
                '</small><label class="album-date-field">Gallery date <input type="date" value="' +
                escapeHtml(state.albumDates[album] || "") +
                '" data-album-date="' +
                escapeHtml(album) +
                '" aria-label="Gallery date for ' +
                escapeHtml(album) +
                '"></label></div><div class="album-manage-actions"><button class="btn small primary" type="button" data-save-album-date="' +
                escapeHtml(album) +
                '">Save date</button><button class="btn small" type="button" data-album-rename="' +
                escapeHtml(album) +
                '">✎ Edit</button>' +
                (album === "General Photos"
                  ? ""
                  : '<button class="btn small danger" type="button" data-album-delete="' +
                    escapeHtml(album) +
                    '">Delete</button>') +
                "</div></div>"
              );
            })
            .join("");
          const moreButton = $("album-manage-more");
          const visibleNote = $("album-manage-visible-note");
          if (moreButton) {
            const hasMore =
              !searching && visibleAlbums.length > pageSize && !window.__galleryAlbumsExpanded;
            moreButton.hidden = !hasMore;
            moreButton.textContent = "Show all " + visibleAlbums.length + " albums";
          }
          if (visibleNote)
            visibleNote.textContent = searching
              ? "Showing all " + visibleAlbums.length + " search results"
              : "Showing " + pageAlbums.length + " of " + visibleAlbums.length + " albums";
          if (!searching && visibleAlbums.length > pageSize && window.__galleryAlbumsExpanded) {
            // Keep the full list available after the user chooses Show all.
            if (moreButton) {
              moreButton.hidden = false;
              moreButton.textContent = "Show fewer albums";
            }
          }
          host.querySelectorAll("[data-save-album-date]").forEach((button) => {
            button.addEventListener("click", async () => {
              const album = button.getAttribute("data-save-album-date");
              const input = host.querySelector('[data-album-date="' + CSS.escape(album) + '"]');
              const value = input?.value || "";
              const previous = { ...state.albumDates };
              if (value) state.albumDates[album] = value;
              else delete state.albumDates[album];
              button.disabled = true;
              try {
                await saveMedia();
                status(
                  "album-admin-status",
                  value
                    ? 'Gallery date saved for "' + album + '". Albums now sort by this date.'
                    : 'Custom gallery date cleared for "' + album + '". Upload date will be used.',
                );
              } catch (err) {
                state.albumDates = previous;
                renderAlbumManager();
                status("album-admin-status", err.message || "Could not save album date.", true);
              } finally {
                button.disabled = false;
              }
            });
          });
          host.querySelectorAll("[data-album-rename]").forEach((button) => {
            button.addEventListener("click", async () => {
              const oldName = button.getAttribute("data-album-rename");
              const proposed = window.prompt("Edit album name:", oldName);
              if (proposed === null) return;
              const newName = proposed.trim().replace(/\s+/g, " ");
              if (!newName) {
                status("album-admin-status", "Album name cannot be empty.", true);
                return;
              }
              if (newName.length > 80) {
                status("album-admin-status", "Album name must be 80 characters or fewer.", true);
                return;
              }
              if (
                newName.toLowerCase() !== oldName.toLowerCase() &&
                state.albums.some((name) => name.toLowerCase() === newName.toLowerCase())
              ) {
                status("album-admin-status", "An album with that name already exists.", true);
                return;
              }
              if (newName === oldName) return;
              const previousAlbums = [...state.albums];
              const previousItems = state.items.map((item) => ({ ...item }));
              state.albums = state.albums.map((name) => (name === oldName ? newName : name));
              state.items.forEach((item) => {
                if (item.album === oldName) item.album = newName;
              });
              renderAlbumOptions();
              renderAlbumManager();
              try {
                await saveMedia();
                status("album-admin-status", 'Album renamed to "' + newName + '" and saved.');
              } catch (err) {
                state.albums = previousAlbums;
                state.items = previousItems;
                renderAlbumOptions();
                renderAlbumManager();
                status("album-admin-status", err.message, true);
              }
            });
          });
          host.querySelectorAll("[data-album-delete]").forEach((button) => {
            button.addEventListener("click", async () => {
              const name = button.getAttribute("data-album-delete");
              const count = state.items.filter(
                (item) => item.type !== "video" && item.album === name,
              ).length;
              const message = count
                ? 'Delete "' +
                  name +
                  '"? Its ' +
                  count +
                  " photo(s) will be moved to General Photos. Files will not be deleted."
                : 'Delete empty album "' + name + '"?';
              if (!window.confirm(message)) return;
              const previousAlbums = [...state.albums];
              const previousItems = state.items.map((item) => ({ ...item }));
              state.albums = state.albums.filter((album) => album !== name);
              state.items.forEach((item) => {
                if (item.album === name) item.album = "General Photos";
              });
              renderAlbumOptions();
              renderAlbumManager();
              renderItems();
              try {
                await saveMedia();
                status(
                  "album-admin-status",
                  count
                    ? "Album deleted. Photos moved safely to General Photos."
                    : "Album deleted.",
                );
              } catch (err) {
                state.albums = previousAlbums;
                state.items = previousItems;
                renderAlbumOptions();
                renderAlbumManager();
                renderItems();
                status("album-admin-status", err.message, true);
              }
            });
          });
        }

        $("album-manage-more")?.addEventListener("click", () => {
          window.__galleryAlbumsExpanded = !window.__galleryAlbumsExpanded;
          renderAlbumManager();
        });
        ["album-manage-search", "album-manage-filter", "album-manage-sort"].forEach((id) => {
          $(id)?.addEventListener(
            id === "album-manage-search" ? "input" : "change",
            renderAlbumManager,
          );
        });
        $("create-album").addEventListener("click", async () => {
          const input = $("new-album-name");
          const name = input.value.trim().replace(/\s+/g, " ");
          const dateInput = $("new-album-date");
          const albumDate = dateInput.value;
          if (!name) {
            status("album-admin-status", "Enter an album name first.", true);
            input.focus();
            return;
          }
          if (!albumDate) {
            status("album-admin-status", "Choose an album date before creating it.", true);
            dateInput.focus();
            return;
          }
          if (name.length > 80) {
            status("album-admin-status", "Album name must be 80 characters or fewer.", true);
            return;
          }
          if (state.albums.some((album) => album.toLowerCase() === name.toLowerCase())) {
            renderAlbumOptions();
            $("media-album").value = state.albums.find(
              (album) => album.toLowerCase() === name.toLowerCase(),
            );
            status("album-admin-status", "That album already exists. It is selected for upload.");
            return;
          }
          state.albums.push(name);
          state.albumDates[name] = albumDate;
          renderAlbumOptions();
          $("media-album").value = name;
          const button = $("create-album");
          button.disabled = true;
          try {
            await saveMedia();
            input.value = "";
            dateInput.value = "";
            status(
              "album-admin-status",
              "Album created with date " +
                albumDate +
                ". It will appear in date order. Add photos to “" +
                name +
                "”.",
            );
          } catch (err) {
            state.albums = state.albums.filter((album) => album !== name);
            delete state.albumDates[name];
            renderAlbumOptions();
            status("album-admin-status", err.message, true);
          } finally {
            button.disabled = false;
          }
        });
        function renderItems() {
          const host = $("media-items");
          const q = $("media-search").value.trim().toLowerCase();
          const filter = $("media-filter").value;
          const all = state.items
            .filter((x) => filter === "all" || x.type === filter)
            .filter(
              (x) =>
                !q ||
                String(x.title || "")
                  .toLowerCase()
                  .includes(q),
            );
          const totalCount = $("count-total");
          const photoCount = $("count-photos");
          const videoCount = $("count-videos");
          if (totalCount) totalCount.textContent = state.items.length;
          if (photoCount)
            photoCount.textContent = state.items.filter((x) => x.type !== "video").length;
          if (videoCount)
            videoCount.textContent = state.items.filter((x) => x.type === "video").length;
          if (!all.length) {
            host.innerHTML =
              '<div class="empty"><strong>' +
              (state.items.length ? "No matching media" : "Your library is ready") +
              "</strong><br><span>" +
              (state.items.length
                ? "Try a different search or filter."
                : "Upload a photo or video above to get started.") +
              "</span></div>";
            return;
          }
          host.innerHTML = all
            .map((x) => {
              const url = safeMediaUrl(x.url);
              if (!url) return "";
              const title = escapeHtml(x.title || "Tilak Varma media");
              const video = x.type === "video";
              return (
                '<article class="item">' +
                (video
                  ? '<video class="item-media" src="' +
                    url +
                    '" controls preload="metadata" playsinline></video>'
                  : '<img class="item-media" src="' +
                    url +
                    '" alt="' +
                    title +
                    '" loading="lazy" decoding="async">') +
                '<div class="item-info"><strong>' +
                title +
                '</strong><div class="item-meta">' +
                (video ? "VIDEO" : "PHOTO") +
                " · " +
                escapeHtml(
                  x.createdAt
                    ? new Date(x.createdAt).toLocaleDateString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })
                    : "Saved media",
                ) +
                '</div><div class="actions"><a class="btn small" href="' +
                url +
                '" target="_blank" rel="noopener noreferrer">Open ↗</a><button class="btn small" data-remove="' +
                state.items.indexOf(x) +
                '" type="button">Remove</button></div></div></article>'
              );
            })
            .join("");
        }
        function renderGalleryUpdates() {
          const albumHost = $("gallery-updates-albums"),
            mediaHost = $("gallery-updates-media");
          if (!albumHost || !mediaHost) return;
          const albums = state.albums
            .map((name) => {
              const date = state.albumDates[name] || "";
              const count = state.items.filter((item) => item.album === name).length;
              return { name, date, count };
            })
            .sort(
              (x, y) => (y.date || "").localeCompare(x.date || "") || x.name.localeCompare(y.name),
            );
          $("gallery-updates-album-count").textContent = albums.length;
          $("gallery-updates-media-count").textContent = state.items.length;
          $("gallery-updates-latest-date").textContent = albums[0]?.date
            ? new Date(albums[0].date + "T12:00:00").toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "No date";
          const latest = state.items
            .filter((x) => x.createdAt)
            .slice()
            .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))[0];
          $("gallery-updates-latest-upload").textContent = latest?.createdAt
            ? new Date(latest.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "No uploads";
          albumHost.innerHTML = albums.length
            ? albums
                .map(
                  (x) =>
                    '<article class="gallery-update-album"><div><strong>' +
                    escapeHtml(x.name) +
                    "</strong><span>" +
                    x.count +
                    (x.count === 1 ? " item" : " items") +
                    "</span></div><time>" +
                    (x.date
                      ? escapeHtml(
                          new Date(x.date + "T12:00:00").toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }),
                        )
                      : "Date not set") +
                    '</time><button class="btn small" type="button" data-update-album="' +
                    escapeHtml(x.name) +
                    '">Manage ↗</button></article>',
                )
                .join("")
            : '<div class="empty">No albums yet.</div>';
          const recent = state.items
            .filter((x) => x.createdAt)
            .slice()
            .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))
            .slice(0, 12);
          mediaHost.innerHTML = recent.length
            ? recent
                .map((x) => {
                  const url = safeMediaUrl(x.url);
                  return (
                    '<article class="gallery-update-media-item">' +
                    (url && x.type !== "video"
                      ? '<img src="' + url + '" alt="" loading="lazy" decoding="async">'
                      : '<span class="gallery-update-media-icon">' +
                        (x.type === "video" ? "▶" : "▧") +
                        "</span>") +
                    "<div><strong>" +
                    escapeHtml(x.title || "Untitled media") +
                    "</strong><span>" +
                    escapeHtml(x.album || "Unassigned") +
                    "</span><time>" +
                    escapeHtml(
                      new Date(x.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }),
                    ) +
                    "</time></div></article>"
                  );
                })
                .join("")
            : '<div class="empty">No uploaded media yet.</div>';
          albumHost.querySelectorAll("[data-update-album]").forEach((button) =>
            button.addEventListener("click", () => {
              const input = $("album-manage-search");
              location.hash = "#media";
              if (input) {
                input.value = button.getAttribute("data-update-album");
                renderAlbumManager();
              }
            }),
          );
        }
        async function saveMedia() {
          await api("/api/admin/content", {
            method: "POST",
            body: JSON.stringify({
              kind: "media",
              data: { items: state.items, albums: state.albums, albumDates: state.albumDates },
            }),
          });
          renderAlbumManager();
          renderGalleryUpdates();
        }
        let datasetCache = [];
        function prettyAge(hours) {
          if (hours === null || hours === undefined) return "No timestamp";
          if (hours < 1) return Math.max(1, Math.round(hours * 60)) + " min ago";
          if (hours < 48) return Math.floor(hours) + "h " + Math.round((hours % 1) * 60) + "m ago";
          return Math.floor(hours / 24) + "d ago";
        }
        function prettyInterval(hours) {
          return hours >= 720 ? "30 days" : hours + " hours";
        }
        function renderDatasets(data) {
          datasetCache = Array.isArray(data.datasets) ? data.datasets : datasetCache;
          $("dataset-checked").textContent =
            "Checked: " + formatTime(data.checkedAt) + " · " + datasetCache.length + " datasets";
          const filter = $("dataset-filter").value;
          const rows = datasetCache.filter(
            (d) =>
              filter === "all" ||
              (filter === "issues"
                ? !["current", "refreshing"].includes(d.status)
                : ["current", "refreshing"].includes(d.status)),
          );
          const host = $("dataset-list");
          if (!rows.length) {
            host.innerHTML = '<div class="empty">No datasets match this filter.</div>';
            return;
          }
          host.innerHTML = rows
            .map((d) => {
              const summary = d.dataSummary || {};
              const errors = (d.errors || []).filter(Boolean);
              const run = d.latestRun;
              const runState = run
                ? run.status === "completed"
                  ? run.conclusion
                  : run.status
                : "no runs found";
              const details = Object.keys(summary).length
                ? escapeHtml(JSON.stringify(summary, null, 2))
                : "No summary fields found in the saved data.";
              const age = d.ageHours === null ? "Unknown" : prettyAge(d.ageHours);
              const due = d.dueAt ? formatTime(d.dueAt) : "Cannot calculate";
              const badge = d.status || "unknown";
              const errorBox = errors.length
                ? '<div class="dataset-errors"><strong>Source / refresh issues</strong><ul>' +
                  errors.map((e) => "<li>" + escapeHtml(e) + "</li>").join("") +
                  "</ul></div>"
                : "";
              return (
                '<article class="dataset-card"><div class="dataset-top"><div><div class="dataset-title">' +
                escapeHtml(d.name) +
                '</div><div class="dataset-sub">' +
                escapeHtml(d.source || "Source unknown") +
                " · " +
                escapeHtml(d.file) +
                '</div></div><span class="dataset-badge ' +
                escapeHtml(badge) +
                '">' +
                escapeHtml(badge.replaceAll("-", " ")) +
                '</span></div><div class="dataset-body"><div class="dataset-metrics">' +
                '<div class="dataset-metric"><span>Last data update</span><strong>' +
                escapeHtml(formatTime(d.lastDataUpdate)) +
                "</strong><span>" +
                escapeHtml(age) +
                '</span></div><div class="dataset-metric"><span>Expected interval</span><strong>' +
                escapeHtml(prettyInterval(d.intervalHours)) +
                "</strong><span>Next due: " +
                escapeHtml(due) +
                '</span></div><div class="dataset-metric"><span>Latest workflow</span><strong>' +
                escapeHtml(runState) +
                "</strong><span>" +
                escapeHtml(run ? formatTime(run.createdAt) : "No workflow history") +
                "</span></div></div>" +
                errorBox +
                '<details class="dataset-details"><summary>What data is saved? (' +
                escapeHtml(d.dataCount ?? "—") +
                ' items/records)</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0 0;font:11px/1.5 ui-monospace,monospace">' +
                details +
                '</pre></details><div class="dataset-actions"><button class="btn small primary" type="button" data-dataset-run="' +
                escapeHtml(d.workflow) +
                '">Refresh now ↗</button><a class="btn small" href="' +
                safeMediaUrl(d.workflowUrl) +
                '" target="_blank" rel="noopener noreferrer">Workflow history ↗</a>' +
                (run && run.url
                  ? '<a class="btn small" href="' +
                    safeMediaUrl(run.url) +
                    '" target="_blank" rel="noopener noreferrer">Latest logs ↗</a>'
                  : "") +
                '</div></div><div class="dataset-footer">Last successful run: ' +
                escapeHtml(
                  d.latestSuccess
                    ? formatTime(d.latestSuccess.createdAt)
                    : "Not found in recent history",
                ) +
                (d.latestFailure
                  ? " · Latest failure: " + escapeHtml(formatTime(d.latestFailure.createdAt))
                  : "") +
                (d.attemptStatus ? " · Data-source attempt: " + escapeHtml(d.attemptStatus) : "") +
                "</div></article>"
              );
            })
            .join("");
        }
        async function loadDatasets() {
          const button = $("dataset-refresh");
          if (button) button.disabled = true;
          status("dataset-status", "Checking timestamps, schedules and source errors…");
          try {
            const data = await api("/api/admin/data-status");
            renderDatasets(data);
            const issues = datasetCache.filter(
              (d) => !["current", "refreshing"].includes(d.status),
            ).length;
            status(
              "dataset-status",
              issues
                ? issues +
                    " dataset(s) need attention. Open each card to inspect saved data and error details."
                : "All tracked datasets are within their expected update intervals.",
            );
          } catch (err) {
            status("dataset-status", err.message, true);
            $("dataset-list").innerHTML =
              '<div class="empty">Could not read data freshness. Check GitHub token permissions and admin session.</div>';
          } finally {
            if (button) button.disabled = false;
          }
        }
        $("dataset-refresh").addEventListener("click", loadDatasets);
        $("dataset-filter").addEventListener("change", () =>
          renderDatasets({ checkedAt: new Date().toISOString() }),
        );
        $("dataset-list").addEventListener("click", async (event) => {
          const button = event.target.closest("[data-dataset-run]");
          if (!button) return;
          const workflow = button.dataset.datasetRun;
          const dataset = datasetCache.find((d) => d.workflow === workflow);
          if (
            !confirm(
              "Start refresh workflow for " +
                (dataset ? dataset.name : workflow) +
                "? Existing data stays available while the job runs.",
            )
          )
            return;
          button.disabled = true;
          status("dataset-status", "Starting workflow " + workflow + "…");
          try {
            const result = await api("/api/admin/data-status", {
              method: "POST",
              body: JSON.stringify({ action: "refresh", workflow }),
            });
            status(
              "dataset-status",
              result.message || "Refresh workflow queued. Re-check in a few seconds.",
            );
            window.setTimeout(loadDatasets, 2500);
          } catch (err) {
            status("dataset-status", err.message, true);
            button.disabled = false;
          }
        });
        function formatTime(value) {
          if (!value) return "time unavailable";
          const date = new Date(value);
          return Number.isNaN(date.getTime())
            ? value
            : new Intl.DateTimeFormat("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
              }).format(date) + " IST";
        }
        function renderMonitor(data) {
          const host = $("monitor-runs");
          $("monitor-checked").textContent =
            "Last checked: " +
            formatTime(data.checkedAt) +
            " · " +
            (data.repository || "repository");
          const runs = Array.isArray(data.runs) ? data.runs : [];
          if (!runs.length) {
            host.innerHTML = '<div class="empty">No recent GitHub Actions runs found.</div>';
            return;
          }
          host.innerHTML = runs
            .map((run) => {
              const stateName =
                run.status === "completed"
                  ? run.conclusion || "completed"
                  : run.status || "unknown";
              const failed = run.conclusion === "failure";
              const jobs = Array.isArray(run.failedJobs) ? run.failedJobs : [];
              const issues = failed
                ? jobs
                    .map((job) => {
                      const steps = (job.steps || [])
                        .map(
                          (step) =>
                            "<li><strong>" +
                            escapeHtml(step.name || "Failed step") +
                            "</strong> · " +
                            escapeHtml(step.conclusion || "error") +
                            "</li>",
                        )
                        .join("");
                      return (
                        "<div><strong>" +
                        escapeHtml(job.name || "Job") +
                        "</strong>" +
                        (steps ? "<ul>" + steps + "</ul>" : "") +
                        "</div>"
                      );
                    })
                    .join("")
                : "";
              return (
                '<article class="run-card"><div class="run-head"><div><div class="run-title">' +
                escapeHtml(run.name || run.title || "GitHub Actions") +
                '</div><div class="run-detail">' +
                escapeHtml(run.title || "") +
                " · #" +
                escapeHtml(run.id) +
                " · branch " +
                escapeHtml(run.branch || "main") +
                '</div><div class="run-detail">Started: ' +
                escapeHtml(formatTime(run.createdAt)) +
                (run.updatedAt ? " · Updated: " + escapeHtml(formatTime(run.updatedAt)) : "") +
                '</div></div><span class="run-state ' +
                escapeHtml(stateName) +
                '">' +
                escapeHtml(stateName.replaceAll("_", " ")) +
                "</span></div>" +
                (issues
                  ? '<div class="run-errors"><strong>Detected failure / failed step</strong>' +
                    issues +
                    "</div>"
                  : "") +
                '<div class="run-actions"><a class="btn small" href="' +
                safeMediaUrl(run.url) +
                '" target="_blank" rel="noopener noreferrer">Open full logs ↗</a>' +
                (failed || run.conclusion === "cancelled"
                  ? '<button class="btn small" type="button" data-rerun="' +
                    escapeHtml(run.id) +
                    '">Re-run failed jobs</button>'
                  : "") +
                "</div></article>"
              );
            })
            .join("");
        }
        async function loadMonitor() {
          const button = $("monitor-refresh");
          if (button) button.disabled = true;
          status("monitor-status", "Checking recent refresh jobs and failed steps…");
          try {
            const data = await api("/api/admin/monitor");
            renderMonitor(data);
            const failures = (data.runs || []).filter((run) => run.conclusion === "failure").length;
            status(
              "monitor-status",
              failures
                ? failures +
                    " failed run(s) in the latest 20 runs. Open a failed step or rerun after fixing the cause."
                : "No failed runs in the latest 20 runs.",
            );
          } catch (err) {
            status("monitor-status", err.message, true);
            $("monitor-runs").innerHTML =
              '<div class="empty">Could not load workflow status. Check GITHUB_TOKEN Actions read permission and sign-in status.</div>';
          } finally {
            if (button) button.disabled = false;
          }
        }
        $("monitor-refresh").addEventListener("click", loadMonitor);
        $("monitor-diagnose").addEventListener("click", async () => {
          const button = $("monitor-diagnose");
          button.disabled = true;
          status("monitor-status", "Requesting Python diagnostics workflow…");
          try {
            const result = await api("/api/admin/monitor", {
              method: "POST",
              body: JSON.stringify({ action: "diagnostics" }),
            });
            status("monitor-status", result.message || "Python diagnostics queued.");
            window.setTimeout(loadMonitor, 2500);
          } catch (err) {
            status("monitor-status", err.message, true);
          } finally {
            button.disabled = false;
          }
        });
        $("monitor-runs").addEventListener("click", async (event) => {
          const button = event.target.closest("[data-rerun]");
          if (!button) return;
          const runId = button.dataset.rerun;
          if (
            !confirm(
              "Re-run the failed jobs for this workflow? This will start a new GitHub Actions run.",
            )
          )
            return;
          button.disabled = true;
          status("monitor-status", "Queueing failed jobs for re-run…");
          try {
            const result = await api("/api/admin/monitor", {
              method: "POST",
              body: JSON.stringify({ action: "rerun", runId }),
            });
            status("monitor-status", result.message || "Re-run queued.");
            window.setTimeout(loadMonitor, 2500);
          } catch (err) {
            status("monitor-status", err.message, true);
            button.disabled = false;
          }
        });
        const videoSourceInventory = [
          {
            title: "Official BCCI CMS video API",
            role: "Primary collection API · international and domestic videos, season/category/format filters, pagination and player-specific searches.",
            url: "https://www.bcci.tv/api/bff/cms/videos",
            detail:
              "Collector queries page, pageNumber, pageNo and offset pagination; categories include highlights, features/interviews and press conferences; formats include T20, ODI and Test.",
          },
          {
            title: "Official BCCI latest domestic feed",
            role: "Additional domestic-video collection endpoint.",
            url: "https://www.bcci.tv/api/bff/cms/videos/latest?tag=domestic",
            detail:
              "Also queried with domestic features/interviews and season tags to catch clips outside the main international pages.",
          },
          {
            title: "Official BCCI player archive",
            role: "Browser-captured catalogue and Load More pagination fallback.",
            url: "https://live-bccitv.epicon.in/videos/player/993?platform=international&type=men",
            detail:
              "Player ID 993 · responses from the official archive are collected to discover additional/older pages.",
          },
          {
            title: "Saved public video feed",
            role: "Normalized JSON file loaded by the public Videos section after the Python collector processes BCCI responses.",
            url: "../assets/bcci-videos.json",
            local: true,
            detail:
              "Stores normalized video metadata, thumbnails, publication date, format and signed playback URLs.",
          },
          {
            title: "Admin Python source URL",
            role: "Python checks the saved API response, keeps only Tilak Varma clips with a direct HTTPS playback URL (.m3u8, .mpd or .mp4), and publishes only those to the public feed.",
            url: "../data/video-config.json",
            config: true,
            detail:
              "On save, GitHub Actions runs scripts/refresh_bcci_videos.py. Python extracts Tilak videos and writes the normalized public cache.",
          },
          {
            title: "Video playback streams",
            role: "Playback URLs returned by BCCI catalogue metadata.",
            url: "https://stream.mux.com/",
            detail:
              "HLS .m3u8 playback URLs are opened with Shaka Player. Signed playback tokens can expire and are refreshed by the scheduled collector.",
          },
          {
            title: "Video thumbnails",
            role: "Thumbnail image CDN returned by BCCI video metadata.",
            url: "https://video-images-cdn.staylive.tv/",
            detail:
              "Small, medium, large and xlarge thumbnail variants are used by the public video cards and player queue.",
          },
        ];
        function renderVideoSourceCards(config, feedData, errorMessages = []) {
          const host = $("video-source-list");
          const override = typeof config?.feedUrl === "string" ? config.feedUrl.trim() : "";
          const sources = videoSourceInventory.map((source) => {
            const active = source.config
              ? override
                ? "PYTHON INPUT · saved"
                : "NO CUSTOM INPUT"
              : source.local
                ? "PUBLIC CACHE"
                : source.title === "Official BCCI CMS video API" ||
                    source.title === "Official BCCI latest domestic feed" ||
                    source.title === "Official BCCI player archive"
                  ? "COLLECTOR SOURCE"
                  : source.title === "Video playback streams"
                    ? "PLAYER SOURCE"
                    : "MEDIA SOURCE";
            const url = source.config && override ? override : source.url;
            return (
              '<article class="source-card"><div class="source-card-top"><h4>' +
              escapeHtml(source.title) +
              '</h4><span class="pill">' +
              escapeHtml(active) +
              "</span></div><p>" +
              escapeHtml(source.role) +
              '</p><a class="source-url" href="' +
              escapeHtml(safeMediaUrl(url) || source.url) +
              '" target="_blank" rel="noopener noreferrer">' +
              escapeHtml(url) +
              "</a><p>" +
              escapeHtml(source.detail) +
              "</p></article>"
            );
          });
          host.innerHTML = sources.join("");
          const videos = Array.isArray(feedData?.videos) ? feedData.videos : [];
          const count = feedData ? videos.length : Number(feedData?.count || 0);
          const playableCount = videos.filter((item) => {
            const url = safeMediaUrl(item.playbackUrl);
            if (!url) return false;
            try {
              return /\\.(m3u8|mpd|mp4)$/i.test(new URL(url).pathname);
            } catch {
              return false;
            }
          }).length;
          const thumbnailCount = videos.filter((item) =>
            Boolean(
              safeMediaUrl(
                item.thumbnailUrl ||
                  item.thumbnailUrlSet?.large ||
                  item.thumbnailUrlSet?.medium ||
                  item.thumbnailUrlSet?.small,
              ),
            ),
          ).length;
          const feedIssues =
            feedData && (playableCount !== count || thumbnailCount !== count)
              ? [
                  "Feed health check: " +
                    playableCount +
                    "/" +
                    count +
                    " direct playback URLs and " +
                    thumbnailCount +
                    "/" +
                    count +
                    " thumbnails.",
                ]
              : [];
          $("video-source-count").textContent = feedData ? String(count) : "Unavailable";
          $("video-source-updated").textContent = feedData?.updatedAt
            ? formatTime(feedData.updatedAt)
            : "Timestamp unavailable";
          $("video-source-override").textContent = override
            ? "Saved for Python"
            : "Default BCCI searches";
          const issues = [...errorMessages, ...feedIssues];
          const healthSummary = feedData
            ? " Feed health: " +
              playableCount +
              "/" +
              count +
              " playable URLs · " +
              thumbnailCount +
              "/" +
              count +
              " thumbnails."
            : "";
          const statusMessage = issues.length
            ? "Video source check needs attention: " + issues.join(" · ") + healthSummary
            : "Source check complete. Public Videos always reads assets/bcci-videos.json; " +
              (override
                ? "the saved BCCI URL is a Python collector input."
                : "Python is using its built-in BCCI catalogue searches.") +
              healthSummary;
          status("video-source-status", statusMessage, issues.length > 0);
        }
        async function loadVideoSourceStatus() {
          const refreshButton = $("video-sources-refresh");
          if (refreshButton) refreshButton.disabled = true;
          status("video-source-status", "Checking saved feed and override configuration…");
          const errors = [];
          let config = { feedUrl: "" };
          let feedData = null;
          const [configResult, feedResult] = await Promise.allSettled([
            fetch("../data/video-config.json?v=" + Date.now(), { cache: "no-store" }).then((r) => {
              if (!r.ok) throw Error("video-config.json HTTP " + r.status);
              return r.json();
            }),
            fetch("../assets/bcci-videos.json?v=" + Date.now(), { cache: "no-store" }).then((r) => {
              if (!r.ok) throw Error("bcci-videos.json HTTP " + r.status);
              return r.json();
            }),
          ]);
          if (configResult.status === "fulfilled") config = configResult.value;
          else errors.push(configResult.reason?.message || "Config unavailable");
          if (feedResult.status === "fulfilled") feedData = feedResult.value;
          else errors.push(feedResult.reason?.message || "Saved feed unavailable");
          renderVideoSourceCards(config, feedData, errors);
          if (refreshButton) refreshButton.disabled = false;
        }
        $("video-sources-refresh").addEventListener("click", loadVideoSourceStatus);

        // Friendly form editor: writes only selected primitive fields back into the loaded source object.
        const friendlyDescriptions = {
          career:
            "Career summaries by format. Balls, average and strike rate are stored values; change only when verified.",
          bowling:
            "Format-wise bowling summary and career-breakdown rows. Missing optional FC/List A data will not be fabricated.",
          fielding: "Format-wise catches, stumpings, run-outs and dismissal totals.",
          innings:
            "Player match-by-match batting entries from Statsguru. Use the record selector to choose a row.",
          death:
            "Death Overs archive: format metadata, match innings, over totals and individual delivery records.",
          profile: "Player profile, career headline, featured match, ICC rankings and records.",
        };
        const friendlyFormatOptions = {
          career: [
            ["T20I", "T20I"],
            ["IPL", "IPL"],
            ["ODI", "ODI"],
            ["First-class", "FC"],
            ["List A", "List A"],
            ["Overall T20 (all competitions)", "T20 · all competitions"],
          ],
          bowling: [
            ["T20I", "T20I"],
            ["ODI", "ODI"],
            ["T20", "T20"],
            ["FC", "FC"],
            ["List A", "List A"],
          ],
          fielding: [
            ["T20I", "T20I"],
            ["ODI", "ODI"],
            ["T20", "T20"],
            ["FC", "FC"],
            ["List A", "List A"],
          ],
          innings: [
            ["playerMatches", "Player match list"],
            ["recentInnings", "Recent innings"],
          ],
          death: [
            ["t20i", "T20I"],
            ["ipl", "IPL"],
            ["overall_t20", "T20 · all competitions"],
            ["t20", "T20"],
            ["odi", "ODI"],
            ["test", "Test"],
            ["hyderabad", "Hyderabad domestic"],
          ],
          profile: [
            ["profile", "Player profile"],
            ["careerStats", "Career headline stats"],
            ["featuredMatch", "Featured match"],
            ["iccRankings", "ICC rankings"],
            ["iccRecords", "ICC records"],
            ["activityLog", "Activity log"],
          ],
        };
        let friendlyRoot = null;
        let friendlySavedRoot = null;
        let friendlySavedSha = "";
        let friendlyLoadedKind = "";
        let friendlyDirty = false;
        let editorDirty = false;
        let editorSavedSnapshot = "";
        let editorSavedSha = "";
        function hasUnsavedAdminEdits() {
          return friendlyDirty || editorDirty;
        }
        function confirmDiscardAdminEdits(action) {
          if (!hasUnsavedAdminEdits()) return true;
          const confirmed = window.confirm(
            "You have unsaved changes in the data editor. " +
              action +
              " will discard them. Continue?",
          );
          if (!confirmed) return false;
          friendlyDirty = false;
          editorDirty = false;
          if (friendlySavedRoot) {
            friendlyRoot = JSON.parse(JSON.stringify(friendlySavedRoot));
            friendlyRefreshChoices();
          }
          if (editorLoadedKind) $("data-editor-json").value = editorSavedSnapshot;
          return true;
        }
        window.addEventListener("beforeunload", (event) => {
          if (!hasUnsavedAdminEdits()) return;
          event.preventDefault();
          event.returnValue = "";
        });
        const friendlyEl = (id) => document.getElementById(id);
        function friendlySetStatus(message, error = false) {
          status("friendly-status", message, error);
        }
        function friendlyOptions(select, options, placeholder) {
          const previous = select.value;
          select.innerHTML = options
            .map(
              (item) =>
                '<option value="' + escapeHtml(item[0]) + '">' + escapeHtml(item[1]) + "</option>",
            )
            .join("");
          if (!options.length) select.innerHTML = '<option value="">No records available</option>';
          if (options.some((item) => String(item[0]) === previous)) select.value = previous;
        }
        function friendlyPath(root, path) {
          return path
            .split(".")
            .reduce((value, key) => (value == null ? undefined : value[key]), root);
        }
        function friendlyPut(root, path, value) {
          const keys = path.split(".");
          const last = keys.pop();
          const target = keys.reduce((obj, key) => obj[key], root);
          target[last] = value;
        }
        function friendlyFieldsFor() {
          const kind = friendlyEl("friendly-kind").value;
          const fmt = friendlyEl("friendly-format").value;
          const record = friendlyEl("friendly-record").value;
          const base = friendlyRoot;
          if (!base) return { path: "", object: null };
          if (kind === "career")
            return { path: "careerFormats." + fmt, object: base.careerFormats?.[fmt] };
          if (kind === "bowling" || kind === "fielding") {
            const family = kind === "bowling" ? "bowlingStats" : "fieldingStats";
            const target = base[family]?.formats?.[fmt];
            const parts = record.split(".");
            return {
              path: family + ".formats." + fmt + "." + record,
              object: parts.reduce(
                (value, key) => (value == null ? undefined : value[key]),
                target,
              ),
            };
          }
          if (kind === "innings") {
            const list = fmt === "recentInnings" ? base.recentInnings : base.playerMatches;
            return {
              path: fmt + "." + record,
              object: Array.isArray(list) ? list[Number(record)] : null,
            };
          }
          if (kind === "profile") {
            if (fmt === "iccRecords" || fmt === "activityLog")
              return {
                path: fmt + "." + record,
                object: Array.isArray(base[fmt]) ? base[fmt][Number(record)] : null,
              };
            return { path: fmt, object: base[fmt] };
          }
          if (kind === "death") {
            const d = friendlyRoot.__deathData;
            if (!d) return { path: "", object: null };
            if (record === "root") return { path: "", object: d };
            if (record === "overTotals")
              return {
                path: "formats." + fmt + ".overTotals." + friendlyEl("friendly-over").value,
                object: d.formats?.[fmt]?.overTotals?.[Number(friendlyEl("friendly-over").value)],
              };
            if (record === "innings")
              return {
                path: "formats." + fmt + ".innings." + friendlyEl("friendly-innings").value,
                object: d.formats?.[fmt]?.innings?.[Number(friendlyEl("friendly-innings").value)],
              };
            if (record === "delivery") {
              const ii = Number(friendlyEl("friendly-innings").value),
                oi = Number(friendlyEl("friendly-over").value),
                bi = Number(friendlyEl("friendly-ball").value);
              return {
                path: "formats." + fmt + ".innings." + ii + ".overs." + oi + ".deliveries." + bi,
                object: d.formats?.[fmt]?.innings?.[ii]?.overs?.[oi]?.deliveries?.[bi],
              };
            }
            if (record === "featuredMatch")
              return { path: "featuredMatch", object: d.featuredMatch };
            return { path: "formats." + fmt, object: d.formats?.[fmt] };
          }
          return { path: "", object: null };
        }
        function friendlyRefreshChoices() {
          const kind = friendlyEl("friendly-kind").value;
          const fmtSelect = friendlyEl("friendly-format");
          const recordSelect = friendlyEl("friendly-record");
          friendlyOptions(fmtSelect, friendlyFormatOptions[kind] || []);
          const fmt = fmtSelect.value;
          let rows = [];
          if (friendlyRoot) {
            if (kind === "innings") {
              const list =
                fmt === "recentInnings" ? friendlyRoot.recentInnings : friendlyRoot.playerMatches;
              rows = (Array.isArray(list) ? list : []).map((x, i) => [
                String(i),
                (x.date || "Undated") +
                  " · " +
                  (x.format || "") +
                  " · " +
                  (x.opposition || "") +
                  " · " +
                  (x.runs ?? x.score ?? "—"),
              ]);
            } else if (kind === "bowling" || kind === "fielding") {
              const family = kind === "bowling" ? "bowlingStats" : "fieldingStats";
              const f = friendlyRoot[family]?.formats?.[fmt] || {};
              rows = [];
              if (f.summary && typeof f.summary === "object")
                rows.push(["summary", "Career summary"]);
              (f.careerBreakdown || []).forEach((x, i) =>
                rows.push([
                  "careerBreakdown." + i,
                  "Career breakdown · " + (x.group || x.span || "Row " + (i + 1)),
                ]),
              );
              (f.innings || []).forEach((x, i) =>
                rows.push([
                  "innings." + i,
                  "Innings · " +
                    (x.date || "Undated") +
                    " · " +
                    (x.opposition || "") +
                    " · " +
                    (x.figures || x.runsConceded || ""),
                ]),
              );
            } else if (kind === "profile" && ["iccRecords", "activityLog"].includes(fmt)) {
              rows = (friendlyRoot[fmt] || []).map((x, i) => [
                String(i),
                (x.title || x.category || x.date || "Record") + " · " + (x.description || ""),
              ]);
            } else if (kind === "death" && friendlyRoot.__deathData) {
              const d = friendlyRoot.__deathData,
                f = d.formats?.[fmt] || {};
              rows = [
                ["format", "Format summary"],
                ["overTotals", "Over totals"],
                ["innings", "Match innings"],
                ["featuredMatch", "Featured match"],
              ];
              if (recordSelect.value === "innings") {
                const arr = f.innings || [];
                rows = arr.map((x, i) => [
                  String(i),
                  (x.date || "Undated") +
                    " · " +
                    (x.teams || "Match") +
                    " · innings " +
                    (x.innings ?? "—"),
                ]);
              } else if (recordSelect.value === "overTotals") {
                rows = (f.overTotals || []).map((x, i) => [
                  String(i),
                  "Over " + (x.over ?? i + 1) + " · " + (x.runs ?? 0) + " runs",
                ]);
              } else if (recordSelect.value === "delivery") {
                const ii = Number(friendlyEl("friendly-innings").value),
                  oi = Number(friendlyEl("friendly-over").value);
                rows = (f.innings?.[ii]?.overs?.[oi]?.deliveries || []).map((x, i) => [
                  String(i),
                  "Ball " + (x.ball ?? i + 1) + " · " + (x.totalRuns ?? 0) + " runs",
                ]);
              }
            }
          }
          if (!rows.length)
            rows = [["root", kind === "death" ? "Death Overs archive" : "Selected object"]];
          if (kind === "death") {
            // Keep the first-level target selector stable; nested selectors choose a specific match/over/ball.
            const d = friendlyRoot?.__deathData,
              f = d?.formats?.[fmt] || {};
            const current = recordSelect.value;
            if (
              !["format", "overTotals", "innings", "delivery", "featuredMatch", "root"].includes(
                current,
              )
            )
              recordSelect.value = "format";
            friendlyOptions(recordSelect, [
              ["format", "Format summary"],
              ["overTotals", "Over totals"],
              ["innings", "Match innings"],
              ["delivery", "Ball-by-ball delivery"],
              ["featuredMatch", "Featured match"],
              ["root", "Archive metadata"],
            ]);
            const wrap = friendlyEl("friendly-nested-selectors");
            if (wrap)
              wrap.style.display = ["overTotals", "innings", "delivery"].includes(
                recordSelect.value,
              )
                ? "grid"
                : "none";
            const inningsSelect = friendlyEl("friendly-innings"),
              overSelect = friendlyEl("friendly-over");
            if (inningsSelect)
              friendlyOptions(
                inningsSelect,
                (f.innings || []).map((x, i) => [
                  String(i),
                  (x.date || "Undated") +
                    " · " +
                    (x.teams || "Match") +
                    " · innings " +
                    (x.innings ?? "—"),
                ]),
              );
            const ii = Number(inningsSelect?.value || 0),
              inn = f.innings?.[ii] || {};
            if (overSelect)
              friendlyOptions(
                overSelect,
                (recordSelect.value === "overTotals" ? f.overTotals || [] : inn.overs || []).map(
                  (x, i) => [String(i), "Over " + (x.over ?? i + 1)],
                ),
              );
            const oi = Number(overSelect?.value || 0),
              ov = inn.overs?.[oi] || {};
            const ballSelect = friendlyEl("friendly-ball");
            if (ballSelect)
              friendlyOptions(
                ballSelect,
                (ov.deliveries || []).map((x, i) => [String(i), "Ball " + (x.ball ?? i + 1)]),
              );
          } else {
            friendlyOptions(recordSelect, rows);
            const nested = friendlyEl("friendly-nested-selectors");
            if (nested) nested.style.display = "none";
          }
          friendlyRenderFields();
        }
        function friendlyRenderFields() {
          const kind = friendlyEl("friendly-kind").value,
            fmt = friendlyEl("friendly-format").value,
            record = friendlyEl("friendly-record").value;
          const host = friendlyEl("friendly-fields");
          const selected = friendlyFieldsFor();
          friendlyEl("friendly-description").textContent = friendlyDescriptions[kind] || "";
          if (
            !selected.object ||
            typeof selected.object !== "object" ||
            Array.isArray(selected.object)
          ) {
            host.innerHTML =
              '<div class="empty">No editable record is available for this selection. The saved data will be preserved.</div>';
            return;
          }
          const entries = Object.entries(selected.object).filter(
            ([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v),
          );
          if (!entries.length) {
            host.innerHTML =
              '<div class="empty">This record contains nested data. Choose a specific match, over or ball above to edit its fields.</div>';
            return;
          }
          host.innerHTML = entries
            .map(([key, value]) => {
              const id = "friendly-field-" + key.replace(/[^a-z0-9_-]/gi, "-");
              const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase());
              if (typeof value === "boolean")
                return (
                  '<label class="field friendly-check"><span>' +
                  escapeHtml(label) +
                  '</span><input type="checkbox" id="' +
                  id +
                  '" data-friendly-key="' +
                  escapeHtml(key) +
                  '" ' +
                  (value ? "checked" : "") +
                  "></label>"
                );
              return (
                '<label class="field"><span>' +
                escapeHtml(label) +
                '</span><input id="' +
                id +
                '" data-friendly-key="' +
                escapeHtml(key) +
                '" type="' +
                (typeof value === "number" ? "number" : "text") +
                '" ' +
                (typeof value === "number" ? 'step="any"' : "") +
                ' value="' +
                escapeHtml(value ?? "") +
                '"></label>'
              );
            })
            .join("");
          host.querySelectorAll("[data-friendly-key]").forEach((input) =>
            input.addEventListener("input", () => {
              friendlyDirty = true;
            }),
          );
          host.querySelectorAll("[data-friendly-key]").forEach((input) =>
            input.addEventListener("change", () => {
              friendlyDirty = true;
            }),
          );
        }
        function friendlyApplyFields() {
          const selected = friendlyFieldsFor();
          if (
            !selected.object ||
            typeof selected.object !== "object" ||
            Array.isArray(selected.object)
          )
            throw Error("Choose a record with editable fields first.");
          for (const input of friendlyEl("friendly-fields").querySelectorAll(
            "[data-friendly-key]",
          )) {
            const key = input.dataset.friendlyKey,
              old = selected.object[key];
            let value;
            if (typeof old === "boolean") value = input.checked;
            else if (typeof old === "number") {
              if (input.value.trim() === "")
                throw Error("Please fill the " + key + " field or reload the saved values.");
              value = Number(input.value);
              if (!Number.isFinite(value)) throw Error(key + " must be a valid number.");
            } else value = input.value;
            selected.object[key] = value;
          }
        }
        async function friendlyLoad() {
          if (!confirmDiscardAdminEdits("Reloading saved values")) return;
          const kind = friendlyEl("friendly-kind").value;
          const fileKind = kind === "death" ? "death" : "stats";
          friendlyEl("friendly-refresh").disabled = true;
          friendlyEl("friendly-save").disabled = true;
          friendlySetStatus(
            "Loading the latest saved " +
              (fileKind === "death" ? "Death Overs archive" : "Stats & career data") +
              "…",
          );
          try {
            const result = await api("/api/admin/data-editor?kind=" + fileKind);
            if (fileKind === "death") {
              friendlyRoot = friendlyRoot || {};
              friendlyRoot.__deathData = result.data;
            } else friendlyRoot = result.data;
            friendlySavedRoot = JSON.parse(JSON.stringify(friendlyRoot));
            friendlySavedSha = result.sha || "";
            friendlyLoadedKind = kind;
            friendlyDirty = false;
            friendlyRefreshChoices();
            friendlySetStatus(
              "Loaded successfully. Choose a section and edit the visible fields; nested arrays and other formats are preserved.",
            );
          } catch (err) {
            friendlySetStatus(err.message, true);
          } finally {
            friendlyEl("friendly-refresh").disabled = false;
            friendlyEl("friendly-save").disabled = false;
          }
        }
        async function friendlySave() {
          const kind = friendlyEl("friendly-kind").value;
          const fileKind = kind === "death" ? "death" : "stats";
          if (friendlyLoadedKind !== kind) {
            friendlySetStatus("Load the latest saved file before editing this section.", true);
            return;
          }
          try {
            const baseline =
              fileKind === "death" ? friendlySavedRoot?.__deathData : friendlySavedRoot;
            if (!baseline) throw Error("Reload the saved file before publishing changes.");
            friendlySetStatus("Checking for newer repository changes before saving…");
            const latest = await api("/api/admin/data-editor?kind=" + fileKind);
            if (
              !friendlySavedSha ||
              latest.sha !== friendlySavedSha ||
              JSON.stringify(latest.data) !== JSON.stringify(baseline)
            ) {
              friendlySetStatus(
                "Save blocked: this file changed in GitHub after you loaded it. Reload saved values, review the newer data, then reapply your edit.",
                true,
              );
              return;
            }
            friendlyApplyFields();
            const root = fileKind === "death" ? friendlyRoot.__deathData : friendlyRoot;
            const button = friendlyEl("friendly-save");
            button.disabled = true;
            friendlySetStatus("Validating and saving selected changes to GitHub…");
            const result = await api("/api/admin/data-editor", {
              method: "POST",
              body: JSON.stringify({ kind: fileKind, data: root, expectedSha: friendlySavedSha }),
            });
            const verified = await api("/api/admin/data-editor?kind=" + fileKind);
            if (fileKind === "death") friendlyRoot.__deathData = verified.data;
            else friendlyRoot = verified.data;
            friendlySavedRoot = JSON.parse(JSON.stringify(friendlyRoot));
            friendlySavedSha = verified.sha || "";
            friendlyDirty = false;
            friendlyRefreshChoices();
            friendlySetStatus(
              "Saved and reloaded " +
                result.path +
                " successfully. Repository read-back verified. Commit: " +
                (result.commit || "created") +
                ". Cloudflare Pages deployment runs separately.",
            );
          } catch (err) {
            friendlySetStatus(err.message, true);
          } finally {
            friendlyEl("friendly-save").disabled = false;
          }
        }
        let previousFriendlyKind = friendlyEl("friendly-kind").value;
        friendlyEl("friendly-kind").addEventListener("change", async () => {
          const nextKind = friendlyEl("friendly-kind").value;
          if (friendlyDirty && !confirmDiscardAdminEdits("Changing the editor section")) {
            friendlyEl("friendly-kind").value = previousFriendlyKind;
            return;
          }
          previousFriendlyKind = nextKind;
          friendlyRoot = null;
          friendlyLoadedKind = "";
          friendlyDirty = false;
          await friendlyLoad();
        });
        friendlyEl("friendly-format").addEventListener("change", friendlyRefreshChoices);
        friendlyEl("friendly-record").addEventListener("change", friendlyRefreshChoices);
        ["friendly-innings", "friendly-over", "friendly-ball"].forEach((id) =>
          friendlyEl(id).addEventListener("change", friendlyRefreshChoices),
        );
        friendlyEl("friendly-refresh").addEventListener("click", friendlyLoad);
        friendlyEl("friendly-save").addEventListener("click", friendlySave);
        const editorPaths = {
          stats: "data/site-data.json",
          death: "data/death-overs.json",
        };
        let editorLoadedKind = "";
        async function loadDataEditor() {
          if (!confirmDiscardAdminEdits("Loading the raw JSON file")) return;
          const kind = $("data-editor-kind").value;
          const button = $("data-editor-load");
          button.disabled = true;
          status("data-editor-status", "Loading latest saved " + editorPaths[kind] + "…");
          try {
            const result = await api("/api/admin/data-editor?kind=" + encodeURIComponent(kind));
            $("data-editor-json").value = JSON.stringify(result.data, null, 2);
            $("data-editor-path").textContent = result.path;
            editorLoadedKind = kind;
            editorSavedSnapshot = $("data-editor-json").value;
            editorSavedSha = result.sha || "";
            editorDirty = false;
            status(
              "data-editor-status",
              "Loaded " +
                result.path +
                ". " +
                (kind === "stats"
                  ? "This file feeds profile, batting, bowling, fielding, innings and ranking views."
                  : "This file feeds Death Overs match, innings, over and ball-level views."),
            );
          } catch (err) {
            status("data-editor-status", err.message, true);
          } finally {
            button.disabled = false;
          }
        }
        $("data-editor-load").addEventListener("click", loadDataEditor);
        let previousEditorKind = $("data-editor-kind").value;
        $("data-editor-kind").addEventListener("change", () => {
          const nextKind = $("data-editor-kind").value;
          if (!confirmDiscardAdminEdits("Changing the raw JSON data family")) {
            $("data-editor-kind").value = previousEditorKind;
            return;
          }
          previousEditorKind = nextKind;
          $("data-editor-path").textContent = editorPaths[nextKind];
          editorLoadedKind = "";
          editorDirty = false;
          $("data-editor-json").value = "";
          editorSavedSnapshot = "";
          editorSavedSha = "";
          status("data-editor-status", "Data family changed. Load the saved file before editing.");
        });
        $("data-editor-json").addEventListener("input", () => {
          editorDirty =
            editorLoadedKind === $("data-editor-kind").value &&
            $("data-editor-json").value !== editorSavedSnapshot;
          status(
            "data-editor-status",
            editorDirty
              ? "Unsaved JSON changes — save before leaving or reloading."
              : "No unsaved JSON changes.",
          );
        });
        $("data-editor-format").addEventListener("click", () => {
          try {
            const parsed = JSON.parse($("data-editor-json").value);
            $("data-editor-json").value = JSON.stringify(parsed, null, 2);
            editorDirty = $("data-editor-json").value !== editorSavedSnapshot;
            status(
              "data-editor-status",
              editorDirty
                ? "JSON formatted. Unsaved changes — not published yet."
                : "JSON formatted locally. No changes to publish.",
            );
          } catch (err) {
            status("data-editor-status", "JSON syntax error: " + err.message, true);
          }
        });
        $("data-editor-save").addEventListener("click", async () => {
          const kind = $("data-editor-kind").value;
          if (editorLoadedKind !== kind) {
            status(
              "data-editor-status",
              "Load the latest saved file for this data family before saving.",
              true,
            );
            return;
          }
          if (!editorDirty) {
            status("data-editor-status", "No unsaved changes to publish.");
            return;
          }
          if (
            !confirm(
              "Publish the entire " +
                editorPaths[kind] +
                " file to GitHub? This can change public Stats or Death Overs pages.",
            )
          )
            return;
          const button = $("data-editor-save");
          button.disabled = true;
          status("data-editor-status", "Checking for newer repository changes before saving…");
          try {
            const latest = await api("/api/admin/data-editor?kind=" + encodeURIComponent(kind));
            const baseline = JSON.stringify(JSON.parse(editorSavedSnapshot));
            if (
              !editorSavedSha ||
              latest.sha !== editorSavedSha ||
              JSON.stringify(latest.data) !== baseline
            ) {
              status(
                "data-editor-status",
                "Save blocked: this file changed in GitHub after you loaded it. Reload the latest file, review the changes, then reapply your edit.",
                true,
              );
              return;
            }
            status("data-editor-status", "Validating and saving JSON to GitHub…");
            const result = await api("/api/admin/data-editor", {
              method: "POST",
              body: JSON.stringify({
                kind,
                data: $("data-editor-json").value,
                expectedSha: editorSavedSha,
              }),
            });
            const verified = await api("/api/admin/data-editor?kind=" + encodeURIComponent(kind));
            const savedText = JSON.stringify(verified.data, null, 2);
            const submittedText = JSON.stringify(JSON.parse($("data-editor-json").value), null, 2);
            if (savedText !== submittedText) {
              throw Error(
                "GitHub accepted the save, but the read-back did not match the submitted JSON. Reload and inspect before making more edits.",
              );
            }
            $("data-editor-json").value = savedText;
            editorSavedSnapshot = savedText;
            editorSavedSha = verified.sha || "";
            editorDirty = false;
            status(
              "data-editor-status",
              "Saved and reloaded " +
                result.path +
                ". Repository read-back verified. Commit: " +
                (result.commit || "created") +
                ". Cloudflare Pages deployment runs separately.",
            );
            editorLoadedKind = kind;
          } catch (err) {
            status("data-editor-status", err.message, true);
          } finally {
            button.disabled = false;
          }
        });
        async function loadStudio() {
          const [m, v] = await Promise.all([
            api("/api/admin/content?kind=media"),
            api("/api/admin/content?kind=video"),
          ]);
          state.items = Array.isArray(m.items) ? m.items : [];
          state.albums = Array.isArray(m.albums)
            ? m.albums.filter((x) => typeof x === "string" && x.trim())
            : [];
          state.albumDates = m.albumDates && typeof m.albumDates === "object" ? m.albumDates : {};
          state.items.forEach((item) => {
            if (item.type !== "video" && item.album && !state.albums.includes(item.album))
              state.albums.push(item.album);
          });
          if (!state.albums.includes("General Photos")) state.albums.unshift("General Photos");
          renderAlbumOptions();
          renderAlbumManager();
          state.video = v;
          $("video-url").value = v.feedUrl || "";
          $("login-view").classList.add("hidden");
          $("admin-app").classList.remove("hidden");
          $("logout").classList.remove("hidden");
          renderItems();
          renderGalleryUpdates();
          loadVideoSourceStatus();
          loadMonitor();
          loadDatasets();
          friendlyLoad();
          status(
            "setup-status",
            "Signed in. Server-side services are ready to report configuration issues when used.",
          );
        }
        $("login-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const b = e.submitter;
          b.disabled = true;
          status("login-status", "Verifying secure sign-in…");
          try {
            await api("/api/admin/login", {
              method: "POST",
              body: JSON.stringify({ password: $("password").value }),
            });
            $("password").value = "";
            await loadStudio();
          } catch (err) {
            status("login-status", err.message, true);
          } finally {
            b.disabled = false;
          }
        });
        $("logout").addEventListener("click", async () => {
          try {
            await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" });
          } finally {
            $("admin-app").classList.add("hidden");
            $("login-view").classList.remove("hidden");
            $("password").value = "";
            status("login-status", "You are signed out.");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        });
        $("bcci-import-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const button = $("bcci-import-submit");
          const urls = $("bcci-import-urls")
            .value.split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean);
          if (!urls.length) {
            status("bcci-import-status", "Paste at least one BCCI image URL.", true);
            return;
          }
          if (urls.length > 12) {
            status("bcci-import-status", "Import up to 12 image URLs at a time.", true);
            return;
          }
          button.disabled = true;
          status(
            "bcci-import-status",
            "Downloading BCCI photos and saving them to this repository…",
          );
          try {
            const result = await api("/api/admin/import-bcci-photo", {
              method: "POST",
              body: JSON.stringify({
                urls,
                album: $("bcci-import-album").value,
                titlePrefix: $("bcci-import-title").value.trim(),
              }),
            });
            const latest = await api("/api/admin/content?kind=media");
            state.items = Array.isArray(latest.items) ? latest.items : [];
            state.albums = Array.isArray(latest.albums)
              ? latest.albums.filter((name) => typeof name === "string" && name.trim())
              : ["General Photos"];
            state.albumDates =
              latest.albumDates && typeof latest.albumDates === "object"
                ? latest.albumDates
                : state.albumDates;
            if (!state.albums.includes("General Photos")) state.albums.unshift("General Photos");
            renderAlbumOptions();
            renderAlbumManager();
            renderItems();
            $("bcci-import-urls").value = "";
            const problems = Array.isArray(result.errors) ? result.errors.length : 0;
            let message =
              (result.added?.length || 0) +
              " photo(s) added to the selected album; " +
              (result.skipped || 0) +
              " duplicate(s) skipped. " +
              "Saved in GitHub repository storage; Cloudinary was not used for these imports.";
            if (problems)
              message +=
                " " +
                problems +
                " URL(s) failed: " +
                result.errors.map((item) => item.error).join(" · ");
            status("bcci-import-status", message, problems > 0 && !result.added?.length);
          } catch (err) {
            status("bcci-import-status", err.message, true);
          } finally {
            button.disabled = false;
          }
        });
        $("external-photo-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const button = $("external-photo-submit");
          const pasted = $("external-photo-url").value.trim();
          const markdown = pasted.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
          const found = markdown ? markdown[1] : (pasted.match(/https?:\/\/[^\s<>()|]+/i) || [])[0];
          const raw = String(found || "")
            .replace(/&amp;/gi, "&")
            .replace(/\\&/g, "&")
            .replace(/[.,;]+$/, "");
          let parsed;
          try {
            parsed = new URL(raw);
          } catch {}
          if (
            !parsed ||
            parsed.protocol !== "https:" ||
            parsed.hostname !== "media.gettyimages.com" ||
            !/^\/id\/\d+\/photo\/[^/]+\.jpe?g$/i.test(parsed.pathname) ||
            parsed.username ||
            parsed.password ||
            parsed.hash
          ) {
            status(
              "external-photo-status",
              "Paste a valid Getty direct image URL (media.gettyimages.com/id/.../photo/...jpg).",
              true,
            );
            return;
          }
          const album = $("external-photo-album").value;
          const title = $("external-photo-title").value.trim();
          if (!album || !title) {
            status("external-photo-status", "Choose an album and enter a photo title.", true);
            return;
          }
          const url = parsed.href;
          if (state.items.some((item) => item.url === url || item.sourceUrl === url)) {
            status(
              "external-photo-status",
              "This Getty image URL is already in the media library.",
              true,
            );
            return;
          }
          const previous = state.items;
          state.items = [
            {
              title,
              album,
              url,
              sourceUrl: url,
              type: "image",
              storage: "external",
              createdAt: new Date().toISOString(),
            },
            ...state.items,
          ];
          button.disabled = true;
          try {
            await saveMedia();
            renderItems();
            $("external-photo-url").value = "";
            status(
              "external-photo-status",
              "Getty image URL added to “" + album + "”. No image file was downloaded or copied.",
            );
          } catch (err) {
            state.items = previous;
            renderItems();
            status("external-photo-status", err.message || "Could not save this photo URL.", true);
          } finally {
            button.disabled = false;
          }
        });
        $("upload-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const file = $("media-file").files[0];
          if (!file) return;
          const video = file.type.startsWith("video/");
          const limit = video ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
          if (file.size > limit) {
            status("upload-status", "File is over the supported size limit.", true);
            return;
          }
          const btn = e.submitter;
          btn.disabled = true;
          status("upload-status", "Preparing secure upload…");
          try {
            const signed = await api("/api/admin/sign-upload", {
              method: "POST",
              body: JSON.stringify({ resourceType: video ? "video" : "image" }),
            });
            const form = new FormData();
            form.append("file", file);
            form.append("api_key", signed.apiKey);
            form.append("timestamp", String(signed.timestamp));
            form.append("folder", signed.folder);
            form.append("signature", signed.signature);
            const response = await fetch(
              "https://api.cloudinary.com/v1_1/" +
                encodeURIComponent(signed.cloudName) +
                "/" +
                signed.resourceType +
                "/upload",
              { method: "POST", body: form },
            );
            const uploaded = await response.json();
            if (!response.ok) throw Error(uploaded.error?.message || "Cloudinary upload failed.");
            state.items.unshift({
              title: $("media-title").value.trim(),
              album: video ? "" : $("media-album").value || "General Photos",
              url: uploaded.secure_url,
              publicId: uploaded.public_id,
              type: video ? "video" : "image",
              createdAt: new Date().toISOString(),
            });
            await saveMedia();
            if (!video && !state.albums.includes($("media-album").value))
              state.albums.push($("media-album").value);
            renderAlbumOptions();
            renderItems();
            const selectedAlbum = $("media-album").value;
            $("upload-form").reset();
            $("media-album").value = selectedAlbum;
            status("upload-status", "Uploaded successfully and published to the gallery.");
          } catch (err) {
            status("upload-status", err.message, true);
          } finally {
            btn.disabled = false;
          }
        });
        $("media-items").addEventListener("click", async (e) => {
          const b = e.target.closest("[data-remove]");
          if (!b) return;
          const i = Number(b.dataset.remove);
          if (!Number.isInteger(i) || !state.items[i]) return;
          if (
            !confirm(
              "Remove this item from the public gallery? The stored file itself will remain in its storage location.",
            )
          )
            return;
          const previous = state.items;
          state.items = state.items.filter((_, j) => j !== i);
          b.disabled = true;
          try {
            await saveMedia();
            renderItems();
            status("upload-status", "Removed from the public gallery.");
          } catch (err) {
            state.items = previous;
            renderItems();
            status("upload-status", err.message, true);
          }
        });
        $("media-search").addEventListener("input", renderItems);
        $("media-filter").addEventListener("change", renderItems);
        $("video-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const btn = e.submitter;
          btn.disabled = true;
          const feedUrl = $("video-url").value.trim();
          if (feedUrl) {
            let parsed;
            try {
              parsed = new URL(feedUrl);
            } catch {
              status("video-status", "Enter a valid official BCCI videos API URL.", true);
              btn.disabled = false;
              return;
            }
            if (
              parsed.protocol !== "https:" ||
              !["www.bcci.tv", "bcci.tv"].includes(parsed.hostname) ||
              !(
                parsed.pathname === "/api/bff/cms/videos" ||
                parsed.pathname === "/api/bff/cms/videos/latest" ||
                /^\/api\/bff\/cms\/videos\/[a-z0-9-]+\/up-next$/i.test(parsed.pathname) ||
                /^\/matches\/[0-9a-f-]+\/[a-z0-9-]+\/video$/i.test(parsed.pathname) ||
                /^\/videos\/[a-z0-9-]+$/i.test(parsed.pathname) ||
                (parsed.pathname === "/videos" &&
                  parsed.searchParams.get("tags") === "international" &&
                  [...parsed.searchParams.keys()].every((key) => key === "tags"))
              ) ||
              parsed.username ||
              parsed.password ||
              parsed.hash
            ) {
              status(
                "video-status",
                "Safety check: use an official BCCI video API, the supported /videos?tags=international listing, up-next endpoint, match video page, or video detail URL.",
                true,
              );
              btn.disabled = false;
              return;
            }
          }
          try {
            await api("/api/admin/content", {
              method: "POST",
              body: JSON.stringify({ kind: "video", data: { feedUrl } }),
            });
            state.video.feedUrl = feedUrl;
            status(
              "video-status",
              "BCCI API URL saved. Python will check the response and direct playback URLs; only playable Tilak Varma videos are published. If no valid playable Tilak clip is found, the existing public feed stays unchanged.",
            );
          } catch (err) {
            status("video-status", err.message, true);
          } finally {
            btn.disabled = false;
          }
        });
        let repoHealthPoll = null;
        async function refreshRepoHealth() {
          const host = $("repo-health-items");
          if (!host) return;
          try {
            const response = await fetch("../data/repo-health.json?ts=" + Date.now(), {
              cache: "no-store",
            });
            if (!response.ok)
              throw Error("Health report unavailable (HTTP " + response.status + ")");
            const report = await response.json();
            const summary = report.summary || {};
            const statusNode = $("repo-health-status");
            statusNode.textContent = String(report.status || "unknown").toUpperCase();
            statusNode.classList.toggle("danger", report.status === "error");
            statusNode.classList.toggle("warning", report.status === "warning");
            $("repo-health-files").textContent = summary.filesScanned ?? "—";
            $("repo-health-passed").textContent = summary.checksPassed ?? "—";
            $("repo-health-errors").textContent = summary.issues ?? 0;
            $("repo-health-warnings").textContent = summary.warnings ?? 0;
            $("repo-health-checked").textContent = report.checkedAt
              ? "Last scan: " +
                new Date(report.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) +
                " IST" +
                " · scheduled every 10 minutes"
              : "Waiting for first scheduled scan";
            $("repo-health-repair").textContent =
              report.autoRepair?.result ||
              "Safe auto-repair is limited to deterministic formatting; logic and cricket data require review.";
            const items = Array.isArray(report.items) ? report.items : [];
            host.innerHTML = items.length
              ? items
                  .map((item) => {
                    const level = ["error", "warning", "pass"].includes(item.level)
                      ? item.level
                      : "warning";
                    const row = document.createElement("article");
                    row.className = "repo-health-item " + level;
                    const title = document.createElement("strong");
                    title.textContent =
                      (level === "error" ? "ERROR" : level === "warning" ? "REVIEW" : "PASS") +
                      " · " +
                      (item.file || "Repository");
                    const detail = document.createElement("p");
                    detail.textContent = item.message || "No details provided";
                    row.append(title, detail);
                    return row.outerHTML;
                  })
                  .join("")
              : '<div class="empty">No scan findings in the latest report.</div>';
          } catch (error) {
            host.textContent = "Could not load repository health report: " + error.message;
          }
        }
        $("repo-health-refresh")?.addEventListener("click", refreshRepoHealth);
        let liveUpdatesPoll = null;
        async function refreshLiveUpdates() {
          const host = $("live-updates-list");
          if (!host) return;
          const badge = $("live-updates-status");
          try {
            const results = await Promise.allSettled([
              api("/api/admin/monitor"),
              fetch("../data/repo-health.json?ts=" + Date.now(), { cache: "no-store" }).then(
                (r) => {
                  if (!r.ok) throw Error("Health report HTTP " + r.status);
                  return r.json();
                },
              ),
              fetch("../assets/bcci-video-refresh-report.json?ts=" + Date.now(), {
                cache: "no-store",
              }).then((r) => {
                if (!r.ok) throw Error("Video refresh report HTTP " + r.status);
                return r.json();
              }),
              fetch("../assets/bcci-videos.json?ts=" + Date.now(), { cache: "no-store" }).then(
                (r) => {
                  if (!r.ok) throw Error("BCCI video feed HTTP " + r.status);
                  return r.json();
                },
              ),
            ]);
            const monitorResult = results[0];
            const healthResult = results[1];
            const videoReportResult = results[2];
            const videoFeedResult = results[3];
            const report = healthResult.status === "fulfilled" ? healthResult.value : null;
            const videoReport =
              videoReportResult.status === "fulfilled" ? videoReportResult.value : null;
            const videoFeed = videoFeedResult.status === "fulfilled" ? videoFeedResult.value : null;
            const totalVideos = Number(
              videoReport?.totalVideos ?? videoFeed?.count ?? videoFeed?.videos?.length ?? 0,
            );
            $("bcci-live-total").textContent = Number.isFinite(totalVideos)
              ? totalVideos.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
              : "—";
            $("bcci-live-added").textContent = videoReport
              ? "+" +
                Number(videoReport.addedCount || 0).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })
              : "Report unavailable";
            $("bcci-live-previous").textContent = videoReport?.previousTotal ?? "—";
            $("bcci-live-updated").textContent = videoReport?.updatedAt
              ? "Last video refresh: " +
                new Date(videoReport.updatedAt).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                }) +
                " IST" +
                " · duplicates removed: " +
                Number(videoReport.duplicateEntriesRemoved || 0)
              : videoFeed?.updatedAt
                ? "Feed updated: " +
                  new Date(videoFeed.updatedAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  }) +
                  " IST" +
                  " · refresh report not available yet"
                : "Video refresh report unavailable";
            const newVideoHost = $("bcci-live-new-list");
            newVideoHost.replaceChildren();
            const newVideos = Array.isArray(videoReport?.addedVideos)
              ? videoReport.addedVideos
              : [];
            if (newVideos.length) {
              for (const video of newVideos.slice(0, 8)) {
                const card = document.createElement("article");
                card.className = "source-card";
                const title = document.createElement("h4");
                title.textContent = video.title || "Untitled BCCI video";
                const meta = document.createElement("p");
                meta.textContent = video.publishedDate
                  ? "Published: " +
                    new Date(video.publishedDate).toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })
                  : "Detected in latest refresh";
                card.append(title, meta);
                newVideoHost.append(card);
              }
            } else {
              newVideoHost.textContent = videoReport
                ? "No new unique video IDs were added in the latest refresh. Existing video history is retained."
                : "Waiting for the first successful run that publishes a video refresh report.";
            }
            if (report) {
              $("live-updates-scan").textContent = report.checkedAt
                ? new Date(report.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) +
                  " IST"
                : "Not scanned yet";
              $("live-updates-errors").textContent = report.summary?.issues ?? "—";
              const warningCount = Number(report.summary?.warnings ?? 0);
              $("live-updates-warnings").textContent = warningCount.toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              });
              const warningCard = $("live-updates-warnings").closest("article");
              let detail = warningCard.querySelector(".live-warning-detail");
              if (!detail) {
                detail = document.createElement("p");
                detail.className = "live-warning-detail";
                warningCard.append(detail);
              }
              const repeated = (report.items || [])
                .filter((item) => item.level === "warning")
                .reduce((sum, item) => {
                  const match = String(item.message || "").match(/(\\d+) repeated CSS selector/);
                  return sum + (match ? Number(match[1]) : 0);
                }, 0);
              detail.textContent = repeated
                ? repeated.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) +
                  " repeated CSS selectors across " +
                  warningCount +
                  " warning entries"
                : "Warning entries from latest saved scan";
              const scanTime = report.checkedAt ? new Date(report.checkedAt).getTime() : 0;
              const stale = !scanTime || Date.now() - scanTime > 20 * 60 * 1000;
              $("live-updates-status").textContent = stale
                ? "STALE SCAN REPORT"
                : "LIVE · CONNECTED";
              $("live-updates-status").classList.toggle("warning", stale);
            } else {
              $("live-updates-scan").textContent = "Unavailable";
              $("live-updates-errors").textContent = "—";
              $("live-updates-warnings").textContent = "—";
            }
            host.replaceChildren();
            if (monitorResult.status === "fulfilled") {
              const data = monitorResult.value;
              const runs = Array.isArray(data.runs) ? data.runs.slice(0, 10) : [];
              for (const run of runs) {
                const row = document.createElement("article");
                row.className = "run-card";
                const heading = document.createElement("strong");
                heading.textContent =
                  (run.conclusion || run.status || "unknown").toUpperCase() +
                  " · " +
                  (run.name || run.title || "GitHub Actions");
                const meta = document.createElement("p");
                meta.textContent =
                  (run.branch || "unknown branch") +
                  " · " +
                  (run.createdAt
                    ? new Date(run.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                    : "time unavailable");
                const link = document.createElement("a");
                link.className = "btn small";
                link.href = run.url || "https://github.com/nitishratre45/tilakvarmafanclub/actions";
                link.target = "_blank";
                link.rel = "noopener";
                link.textContent = "Open run ↗";
                row.append(heading, meta, link);
                host.append(row);
              }
              if (!runs.length) host.textContent = "No recent workflow runs returned.";
              badge.textContent = report ? "LIVE · CONNECTED" : "PARTIAL DATA";
            } else {
              host.textContent = "Workflow activity unavailable: " + monitorResult.reason.message;
              badge.textContent = "WORKFLOW API ERROR";
            }
            if (healthResult.status === "rejected") {
              const note = document.createElement("p");
              note.className = "monitor-help";
              note.textContent =
                "Repository scan report unavailable: " + healthResult.reason.message;
              host.append(note);
            }
            $("live-updates-checked").textContent =
              "Panel checked: " +
              new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) +
              " · auto-refresh every 60 seconds";
          } catch (error) {
            badge.textContent = "ERROR";
            host.textContent = "Could not load live updates: " + error.message;
          }
        }
        document.querySelectorAll("[data-live-tab]").forEach((button) => {
          button.addEventListener("click", () => {
            const target = button.dataset.liveTab;
            document.querySelectorAll("[data-live-tab]").forEach((tab) => {
              const active = tab === button;
              tab.classList.toggle("active", active);
              tab.setAttribute("aria-selected", String(active));
            });
            document.querySelectorAll("[data-live-panel]").forEach((panel) => {
              panel.hidden = panel.dataset.livePanel !== target;
            });
            if (target === "monitor") loadMonitor();
            if (target === "activity") refreshLiveUpdates();
            if (target === "automations") loadAutomationRepoMonitor();
          });
        });
        document
          .querySelectorAll('[data-live-panel]:not([data-live-panel="activity"])')
          .forEach((panel) => {
            panel.hidden = true;
          });
        async function loadAutomationRepoMonitor() {
          const host = $("automation-workflow-list");
          if (!host) return;
          const status = $("automation-status");
          status.textContent = "Refreshing saved repository automation inventory…";
          try {
            const response = await fetch("../data/automation-repo-monitor.json?ts=" + Date.now(), {
              cache: "no-store",
            });
            if (!response.ok) throw new Error("Monitor report HTTP " + response.status);
            const data = await response.json();
            const summary = data.summary || {};
            $("automation-total").textContent = summary.workflows ?? "—";
            $("automation-enabled").textContent = summary.enabled ?? "—";
            $("automation-running").textContent = summary.running ?? "—";
            $("automation-failed").textContent = summary.failedLatest ?? "—";
            $("automation-success").textContent = summary.successfulLatest ?? "—";
            $("automation-checked").textContent = data.checkedAt
              ? "Last snapshot: " +
                new Date(data.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) +
                " · hourly · keeps 15 hours"
              : "Initial snapshot pending";
            host.replaceChildren();
            const workflows = Array.isArray(data.workflows) ? data.workflows : [];
            if (!workflows.length) {
              host.textContent =
                "Inventory is not populated yet. The hourly GitHub Actions monitor must complete its first run.";
            }
            for (const workflow of workflows) {
              const card = document.createElement("details");
              card.className = "run-card automation-workflow-card";
              const heading = document.createElement("summary");
              const latest = workflow.latest || {};
              const result = latest.conclusion || latest.status || "NO RUN";
              heading.textContent =
                (workflow.state === "active" ? "● " : "○ ") +
                workflow.name +
                " · " +
                result.toUpperCase();
              const meta = document.createElement("p");
              meta.textContent =
                workflow.path +
                " · state: " +
                workflow.state +
                " · latest: " +
                (latest.createdAt
                  ? new Date(latest.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                  : "no recorded run") +
                " · recent failures: " +
                (workflow.counts?.failed ?? 0);
              const description = document.createElement("p");
              description.textContent =
                "Recent runs: " +
                (workflow.counts?.recent ?? 0) +
                " · successes: " +
                (workflow.counts?.successful ?? 0) +
                " · running/queued: " +
                (workflow.counts?.running ?? 0);
              const link = document.createElement("a");
              link.className = "btn small";
              link.href =
                workflow.url || "https://github.com/nitishratre45/tilakvarmafanclub/actions";
              link.target = "_blank";
              link.rel = "noopener";
              link.textContent = "Open workflow ↗";
              card.append(heading, meta, description);
              const runs = Array.isArray(workflow.recentRuns) ? workflow.recentRuns : [];
              for (const run of runs.slice(0, 10)) {
                const item = document.createElement("p");
                item.className = "monitor-meta";
                item.textContent =
                  (run.conclusion || run.status || "unknown").toUpperCase() +
                  " · " +
                  (run.createdAt
                    ? new Date(run.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                    : "time unavailable") +
                  " · " +
                  (run.event || "event unknown");
                if (run.runUrl) {
                  const runLink = document.createElement("a");
                  runLink.href = run.runUrl;
                  runLink.target = "_blank";
                  runLink.rel = "noopener";
                  runLink.textContent = " Open run ↗";
                  item.append(runLink);
                }
                card.append(item);
              }
              card.append(link);
              host.append(card);
            }
            const history = $("automation-history-list");
            history.replaceChildren();
            const snapshots = Array.isArray(data.snapshots) ? data.snapshots.slice().reverse() : [];
            if (!snapshots.length) history.textContent = "No snapshots saved yet.";
            for (const snap of snapshots) {
              const row = document.createElement("article");
              row.className = "run-card";
              const title = document.createElement("strong");
              title.textContent =
                new Date(snap.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) +
                " · " +
                (snap.workflows ?? 0) +
                " workflows";
              const detail = document.createElement("p");
              detail.textContent =
                "Enabled " +
                (snap.enabled ?? 0) +
                " · running " +
                (snap.running ?? 0) +
                " · latest failures " +
                (snap.failedLatest ?? 0) +
                " · latest successes " +
                (snap.successfulLatest ?? 0);
              row.append(title, detail);
              history.append(row);
            }
            status.textContent =
              "Inventory loaded · " +
              workflows.length +
              " workflows · snapshots retained for 15 hours.";
          } catch (error) {
            status.textContent =
              "Monitor data unavailable: " +
              error.message +
              ". Check the hourly workflow and its latest run.";
          }
        }
        $("automation-refresh")?.addEventListener("click", loadAutomationRepoMonitor);

        async function loadNewsArchive() {
          const button = $("news-reload");
          if (button) button.disabled = true;
          status("news-manager-message", "Loading saved news archive…");
          try {
            const response = await fetch("../News/newsjson.json?t=" + Date.now(), {
              cache: "no-store",
            });
            if (!response.ok)
              throw new Error("Could not read News/newsjson.json (" + response.status + ")");
            const data = await response.json();
            const news = Array.isArray(data.news) ? data.news : [];
            $("news-count").textContent = String(news.length);
            $("news-updated").textContent = data.updatedAt
              ? new Date(data.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
              : "Not available";
            const host = $("news-source-results");
            host.replaceChildren();
            const summary = document.createElement("article");
            summary.className = "run-card";
            const heading = document.createElement("strong");
            heading.textContent = "Saved archive · " + news.length + " Tilak Varma stories";
            const detail = document.createElement("p");
            detail.textContent =
              "Candidates: " +
              (data.candidateCount ?? "—") +
              " · read errors: " +
              (Array.isArray(data.readErrors) ? data.readErrors.length : 0) +
              " · updated: " +
              (data.updatedAt || "unknown");
            summary.append(heading, detail);
            host.append(summary);
            news.slice(0, 8).forEach((story) => {
              const card = document.createElement("article");
              card.className = "run-card";
              const title = document.createElement("strong");
              title.textContent = story.title || story.webviewUrl || "Untitled story";
              const meta = document.createElement("p");
              meta.textContent =
                (story.publishedAt || "Date unavailable") +
                " · " +
                (story.sourceName || story.source || "News source");
              card.append(title, meta);
              if (story.webviewUrl) {
                const link = document.createElement("a");
                link.className = "btn small";
                link.href = story.webviewUrl;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.textContent = "Open story ↗";
                card.append(link);
              }
              host.append(card);
            });
            if (!news.length)
              host.innerHTML =
                '<div class="empty">No saved stories yet. Run Refresh all news sources.</div>';
            status(
              "news-manager-message",
              "Archive loaded successfully. This is the currently saved data; a running workflow may take a few minutes to publish.",
            );
          } catch (error) {
            status("news-manager-message", error.message, true);
          } finally {
            if (button) button.disabled = false;
          }
        }
        const manualNewsForm = $("manual-news-form");
        const manualNewsStatus = $("manual-news-form-status");
        let manualNewsItems = [];
        const manualNewsSetStatus = (message, isError = false) => {
          if (!manualNewsStatus) return;
          manualNewsStatus.textContent = message;
          manualNewsStatus.className = isError ? "error-text" : "success-text";
        };
        const manualNewsReset = () => {
          manualNewsForm?.reset();
          $("manual-news-id").value = "";
          $("manual-news-source").value = "The 72 Club";
          $("manual-news-save").textContent = "＋ Publish news";
          const now = new Date();
          now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
          $("manual-news-date").value = now.toISOString().slice(0, 16);
          manualNewsSetStatus("Ready to create a story.");
        };
        const manualNewsDateLabel = (value) => {
          const date = new Date(value);
          return Number.isNaN(date.getTime())
            ? "Date unavailable"
            : date.toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                dateStyle: "medium",
                timeStyle: "short",
              }) + " IST";
        };
        async function loadManualNews() {
          const host = $("manual-news-list");
          if (!host) return;
          host.replaceChildren();
          const loading = document.createElement("div");
          loading.className = "empty";
          loading.textContent = "Loading manually published stories…";
          host.appendChild(loading);
          try {
            const archive = await api("/api/admin/content?kind=news");
            manualNewsItems = (Array.isArray(archive.news) ? archive.news : []).filter(
              (item) => item && item.manual === true,
            );
            host.replaceChildren();
            if (!manualNewsItems.length) {
              const empty = document.createElement("div");
              empty.className = "empty";
              empty.textContent =
                "No manual stories yet. Use the editor above to publish the first one.";
              host.appendChild(empty);
              return;
            }
            manualNewsItems.forEach((item) => {
              const card = document.createElement("article");
              card.className = "manual-news-card";
              const cover = document.createElement("div");
              cover.className = "manual-news-cover";
              if (item.imageUrl && /^https:\/\//i.test(item.imageUrl)) {
                const image = document.createElement("img");
                image.src = item.imageUrl;
                image.alt = "";
                image.loading = "lazy";
                image.onerror = () => {
                  cover.textContent = "72";
                };
                cover.appendChild(image);
              } else cover.textContent = "72";
              const details = document.createElement("div");
              details.className = "manual-news-copy";
              const category = document.createElement("span");
              category.className = "manual-news-category";
              category.textContent = item.category || "Manual News";
              const title = document.createElement("h4");
              title.textContent = item.title || "Untitled story";
              const meta = document.createElement("p");
              meta.textContent =
                manualNewsDateLabel(item.publishedAt) + " · " + (item.sourceName || "The 72 Club");
              const excerpt = document.createElement("p");
              excerpt.className = "manual-news-excerpt";
              excerpt.textContent = item.description || "";
              details.append(category, title, meta, excerpt);
              const actions = document.createElement("div");
              actions.className = "manual-news-card-actions";
              const edit = document.createElement("button");
              edit.type = "button";
              edit.className = "btn small";
              edit.textContent = "Edit";
              edit.addEventListener("click", () => {
                $("manual-news-id").value = item.id;
                $("manual-news-title").value = item.title || "";
                $("manual-news-date").value = item.publishedAt
                  ? (() => {
                      const d = new Date(item.publishedAt);
                      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                      return d.toISOString().slice(0, 16);
                    })()
                  : "";
                $("manual-news-category").value = item.category || "Manual News";
                $("manual-news-source").value = item.sourceName || "The 72 Club";
                $("manual-news-image").value = item.imageUrl || "";
                $("manual-news-url").value = item.webviewUrl || "";
                $("manual-news-body").value =
                  item.fullText || item.pageText || item.description || "";
                $("manual-news-save").textContent = "✓ Save changes";
                manualNewsSetStatus("Editing: " + (item.title || item.id));
                manualNewsForm.scrollIntoView({ behavior: "smooth", block: "start" });
                $("manual-news-title").focus({ preventScroll: true });
              });
              const remove = document.createElement("button");
              remove.type = "button";
              remove.className = "btn danger small";
              remove.textContent = "Delete";
              remove.addEventListener("click", async () => {
                if (!window.confirm("Delete this manually added story? This cannot be undone."))
                  return;
                remove.disabled = true;
                try {
                  await api("/api/admin/content", {
                    method: "POST",
                    body: JSON.stringify({ kind: "news", action: "delete", item: { id: item.id } }),
                  });
                  manualNewsSetStatus("Manual story deleted.");
                  await Promise.all([loadManualNews(), loadNewsArchive()]);
                } catch (error) {
                  manualNewsSetStatus(error.message || "Delete failed.", true);
                  remove.disabled = false;
                }
              });
              actions.append(edit, remove);
              card.append(cover, details, actions);
              host.appendChild(card);
            });
          } catch (error) {
            host.replaceChildren();
            const message = document.createElement("div");
            message.className = "empty";
            message.textContent =
              error.message || "Could not load manual news. Please sign in again.";
            host.appendChild(message);
          }
        }
        manualNewsForm?.addEventListener("submit", async (event) => {
          event.preventDefault();
          const button = $("manual-news-save");
          button.disabled = true;
          manualNewsSetStatus("Saving news to GitHub…");
          const dateValue = $("manual-news-date").value;
          const item = {
            id: $("manual-news-id").value.trim(),
            title: $("manual-news-title").value.trim(),
            publishedAt: dateValue ? new Date(dateValue).toISOString() : "",
            category: $("manual-news-category").value,
            sourceName: $("manual-news-source").value.trim() || "The 72 Club",
            imageUrl: $("manual-news-image").value.trim(),
            webviewUrl: $("manual-news-url").value.trim(),
            body: $("manual-news-body").value.trim(),
          };
          try {
            const result = await api("/api/admin/content", {
              method: "POST",
              body: JSON.stringify({ kind: "news", action: "upsert", item }),
            });
            manualNewsReset();
            manualNewsSetStatus(
              (result.action === "upsert"
                ? item.id
                  ? "News updated."
                  : "News published."
                : "News saved.") +
                " Commit: " +
                String(result.commit || "").slice(0, 7),
            );
            await Promise.all([loadManualNews(), loadNewsArchive()]);
          } catch (error) {
            manualNewsSetStatus(error.message || "News could not be saved.", true);
          } finally {
            button.disabled = false;
          }
        });
        $("manual-news-reset")?.addEventListener("click", manualNewsReset);
        $("manual-news-refresh")?.addEventListener("click", loadManualNews);
        manualNewsReset();
        loadManualNews();

        $("run-all-workflows")?.addEventListener("click", async () => {
          const button = $("run-all-workflows");
          if (!button || button.disabled) return;
          const confirmed = window.confirm(
            "Run all 18 manually runnable GitHub Actions workflows now? This starts multiple jobs that may refresh data, run diagnostics, and update repository files. The event-driven auto-rerun workflow is excluded.",
          );
          if (!confirmed) return;
          button.disabled = true;
          button.textContent = "Queueing workflows…";
          status(
            "run-all-workflows-status",
            "Checking for an active batch and queueing workflows…",
          );
          try {
            const result = await api("/api/admin/monitor", {
              method: "POST",
              body: JSON.stringify({ action: "run-all-workflows" }),
            });
            status("run-all-workflows-status", result.message || "Workflow batch queued.");
          } catch (error) {
            status("run-all-workflows-status", error.message || "Could not queue workflows.", true);
          } finally {
            button.disabled = false;
            button.textContent = "Run All Workflows";
          }
        });
        $("news-reload")?.addEventListener("click", loadNewsArchive);
        $("matches-refresh")?.addEventListener("click", async () => {
          const button = $("matches-refresh");
          if (!button) return;
          button.disabled = true;
          const originalText = button.textContent;
          button.textContent = "Queueing match refresh…";
          $("news-manager-status").textContent = "RUNNING";
          status("news-manager-message", "Queueing squad announcement and match details refresh…");
          try {
            const result = await api("/api/admin/monitor", {
              method: "POST",
              body: JSON.stringify({ action: "match-refresh" }),
            });
            status("news-manager-message", result.message || "Match data refresh queued.");
            $("news-manager-status").textContent = "QUEUED";
            window.setTimeout(loadLiveNewsStatus, 2500);
          } catch (error) {
            status("news-manager-message", error.message, true);
            $("news-manager-status").textContent = "ERROR";
          } finally {
            button.disabled = false;
            button.textContent = originalText;
          }
        });
        $("news-refresh")?.addEventListener("click", async () => {
          const button = $("news-refresh");
          if (!button) return;
          button.disabled = true;
          $("news-manager-status").textContent = "RUNNING";
          status("news-manager-message", "Queueing BCCI-only news refresh…");
          try {
            const result = await api("/api/admin/monitor", {
              method: "POST",
              body: JSON.stringify({ action: "news-refresh" }),
            });
            status("news-manager-message", result.message || "News refresh queued.");
            $("news-manager-status").textContent = "QUEUED";
            window.setTimeout(loadLiveNewsStatus, 2500);
          } catch (error) {
            status("news-manager-message", error.message, true);
            $("news-manager-status").textContent = "ERROR";
          } finally {
            button.disabled = false;
          }
        });
        async function loadLiveNewsStatus() {
          try {
            const data = await api("/api/admin/monitor");
            const runs = (data.runs || []).filter(
              (run) =>
                /refresh tilak varma news/i.test(run.name || "") ||
                /refresh-tilak-news/i.test(run.url || ""),
            );
            const host = $("news-source-results");
            if (!runs.length) return;
            host.replaceChildren();
            runs.slice(0, 5).forEach((run) => {
              const card = document.createElement("article");
              card.className = "run-card";
              const title = document.createElement("strong");
              title.textContent =
                (run.name || "News refresh") +
                " · " +
                (run.status === "completed" ? run.conclusion || "completed" : run.status);
              const detail = document.createElement("p");
              detail.textContent =
                "Started: " +
                (run.createdAt
                  ? new Date(run.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                  : "unknown") +
                " · branch: " +
                (run.branch || "main");
              card.append(title, detail);
              if (run.url) {
                const link = document.createElement("a");
                link.href = run.url;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.className = "btn small";
                link.textContent = "Open run logs ↗";
                card.append(link);
              }
              host.append(card);
            });
          } catch {}
        }
        $("live-updates-refresh")?.addEventListener("click", refreshLiveUpdates);
        const viewLabels = {
          dashboard: "Overview",
          media: "Media library",
          "gallery-updates": "Gallery updates",
          video: "Video feed",
          "live-updates": "Live updates",
          news: "News manager",
          "repo-health": "Repository health",
          "data-status": "Data freshness",
          "matches-manager": "Match section",
          "data-editor": "Stats & Death Overs data",
          services: "Services & security",
        };
        function showAdminView(requestedView, updateHash = false) {
          const allowedViews = Object.keys(viewLabels);
          const view = allowedViews.includes(requestedView) ? requestedView : "dashboard";
          const app = $("admin-app");
          app.dataset.currentView = view;
          app
            .querySelectorAll("#admin-nav [data-view], #admin-mobile-bottom-nav [data-view]")
            .forEach((link) => {
              const active = link.dataset.view === view;
              link.classList.toggle("active", active);
              if (active) link.setAttribute("aria-current", "page");
              else link.removeAttribute("aria-current");
            });
          const isOverview = view === "dashboard";
          const dashboard = app.querySelector("#dashboard");
          const stats = app.querySelector(".stats");
          if (dashboard) {
            dashboard.classList.toggle("hidden", !isOverview);
            dashboard.hidden = !isOverview;
            dashboard.setAttribute("aria-hidden", String(!isOverview));
          }
          if (stats) {
            stats.classList.toggle("hidden", !isOverview);
            stats.hidden = !isOverview;
            stats.setAttribute("aria-hidden", String(!isOverview));
          }
          app.querySelectorAll("main > .section").forEach((section) => {
            const active = section.id === view;
            section.classList.toggle("hidden", !active);
            section.hidden = !active;
            section.setAttribute("aria-hidden", String(!active));
          });
          $("page-title").textContent = viewLabels[view];
          if (view === "news") {
            loadNewsArchive();
            loadManualNews();
            loadLiveNewsStatus();
          }
          if (view === "repo-health") {
            refreshRepoHealth();
            if (repoHealthPoll) clearInterval(repoHealthPoll);
            repoHealthPoll = setInterval(refreshRepoHealth, 60000);
          } else if (repoHealthPoll) {
            clearInterval(repoHealthPoll);
            repoHealthPoll = null;
          }
          if (view === "live-updates") {
            refreshLiveUpdates();
            if (liveUpdatesPoll) clearInterval(liveUpdatesPoll);
            liveUpdatesPoll = setInterval(refreshLiveUpdates, 60000);
          } else if (liveUpdatesPoll) {
            clearInterval(liveUpdatesPoll);
            liveUpdatesPoll = null;
          }
          if (updateHash && window.location.hash !== "#" + view) {
            window.location.hash = view;
          }
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        const mobileMenuButton = $("admin-mobile-menu");
        const adminNav = $("admin-nav");
        function setMobileMenu(open) {
          if (!mobileMenuButton || !adminNav) return;
          adminNav.classList.toggle("mobile-open", open);
          mobileMenuButton.setAttribute("aria-expanded", String(open));
          mobileMenuButton.setAttribute(
            "aria-label",
            open ? "Close admin menu" : "Open admin menu",
          );
          mobileMenuButton.classList.toggle("is-open", open);
        }
        mobileMenuButton?.addEventListener("click", () => {
          setMobileMenu(!adminNav.classList.contains("mobile-open"));
        });
        document.addEventListener("click", (event) => {
          if (
            window.innerWidth <= 720 &&
            adminNav?.classList.contains("mobile-open") &&
            !event.target.closest("#admin-nav") &&
            !event.target.closest("#admin-mobile-menu")
          ) {
            setMobileMenu(false);
          }
        });
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape") setMobileMenu(false);
        });
        const mobileBottomNav = $("admin-mobile-bottom-nav");
        if (mobileBottomNav && adminNav) {
          mobileBottomNav.innerHTML = adminNav.innerHTML;
          mobileBottomNav.querySelectorAll("a[data-view]").forEach((link) => {
            link.classList.remove("active");
            link.removeAttribute("aria-current");
          });
          mobileBottomNav.addEventListener("click", (event) => {
            const link = event.target.closest("a[data-view]");
            if (!link) return;
            event.preventDefault();
            showAdminView(link.dataset.view, true);
          });
        }
        $("admin-nav").addEventListener("click", (event) => {
          const link = event.target.closest("a[data-view]");
          if (!link) return;
          event.preventDefault();
          setMobileMenu(false);
          showAdminView(link.dataset.view, true);
        });
        window.addEventListener("resize", () => {
          if (window.innerWidth > 720) setMobileMenu(false);
        });
        window.addEventListener("hashchange", () => {
          showAdminView(window.location.hash.slice(1), false);
        });
        showAdminView(window.location.hash.slice(1) || "dashboard");
        window.setInterval(() => {
          if (!$("admin-app").classList.contains("hidden")) {
            loadMonitor();
            loadDatasets();
          }
        }, 60000);
        api("/api/admin/session")
          .then(async (d) => {
            if (d.authenticated)
              try {
                await loadStudio();
              } catch (err) {
                status("login-status", err.message, true);
              }
          })
          .catch(() => {});
      })();
    