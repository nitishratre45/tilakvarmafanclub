(() => {
  "use strict";

  const $ = (selector, parent = document) => parent.querySelector(selector);

  const status = $("#detail-status");
  const article = $("#news-article");
  const titleNode = $("#detail-title");
  const dateNode = $("#detail-date");
  const relativeDateNode = $("#detail-relative-date");
  const imageNode = $("#detail-image");
  const imageFallback = $("#image-fallback");
  const originalLink = $("#original-link");
  const relatedList = $("#related-stories");
  const relatedCount = $("#related-count");
  const shareButton = $("#share-article");

  const params = new URLSearchParams(location.search);
  const requestedId = params.get("id") || "";

  const NEWS_JSON_PATH = "../News/newsjson.json";
  const MAX_RELATED_STORIES = 5;

  const text = (value, fallback = "") =>
    typeof value === "string" || typeof value === "number" ? String(value).trim() : fallback;

  const safeUrl = (value) => {
    if (typeof value !== "string" || !value.trim()) {
      return "";
    }

    try {
      const url = new URL(value, location.href);

      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  };

  const formatDate = (value) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return text(value);
    }

    return (
      new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(date) + " IST"
    );
  };

  const relativeDate = (value) => {
    if (!value) return "BCCI · News";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return text(value);
    }

    const difference = Date.now() - date.getTime();

    if (difference < 0) {
      return formatDate(value);
    }

    const days = Math.floor(difference / 86400000);

    if (days === 0) return "Today";
    if (days === 1) return "1 day ago";
    if (days < 30) return `${days}d ago`;

    return formatDate(value);
  };

  const showError = (message) => {
    if (status) {
      status.textContent = message;
      status.hidden = false;
      status.setAttribute("role", "alert");
    }

    if (article) {
      article.hidden = true;
    }

    if (relatedList) {
      relatedList.replaceChildren();

      const messageNode = document.createElement("p");
      messageNode.className = "related-loading";
      messageNode.textContent = "Related stories are temporarily unavailable.";

      relatedList.appendChild(messageNode);
    }
  };

  const makeThumb = (url, title) => {
    const imageUrl = safeUrl(url);

    if (!imageUrl) {
      const fallback = document.createElement("div");
      fallback.className = "related-thumb related-thumb-fallback";
      fallback.textContent = "72";
      fallback.setAttribute("aria-label", "The 72 Club");
      return fallback;
    }

    const image = document.createElement("img");

    image.className = "related-thumb";
    image.src = imageUrl;
    image.alt = text(title, "Related news thumbnail");
    image.loading = "lazy";
    image.decoding = "async";

    image.addEventListener(
      "error",
      () => {
        const fallback = makeThumb("", title);
        image.replaceWith(fallback);
      },
      { once: true },
    );

    return image;
  };

  const renderRelated = (items, current) => {
    if (!relatedList) return;

    const others = items.filter((item) => item !== current).slice(0, MAX_RELATED_STORIES);

    if (relatedCount) {
      relatedCount.textContent = `${items.length} STORIES`;
    }

    relatedList.replaceChildren();

    if (!others.length) {
      const message = document.createElement("p");
      message.className = "related-loading";
      message.textContent = "More stories will appear here as the news archive grows.";

      relatedList.appendChild(message);
      return;
    }

    others.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "related-card";

      const copy = document.createElement("div");
      copy.className = "related-copy";

      const category = document.createElement("div");
      category.className = "related-category";
      category.textContent = text(item.category, "Press Releases");

      const link = document.createElement("a");
      link.className = "related-title";

      // Keep the existing article route unchanged.
      const storyId =
        item.id !== undefined && item.id !== null && String(item.id) !== ""
          ? String(item.id)
          : String(items.indexOf(item));

      link.href = `index.html?id=${encodeURIComponent(storyId)}`;
      link.textContent = text(item.title, "Tilak Varma news update");

      const date = document.createElement("div");
      date.className = "related-date";
      date.textContent = relativeDate(item.publishedAt);

      copy.append(category, link, date);

      card.append(copy, makeThumb(item.imageUrl, item.title));

      relatedList.appendChild(card);
    });
  };

  const renderEditorial = (item) => {
    const card = $("#news-desk-card");
    const summaryNode = $("#news-desk-summary");
    const pointsNode = $("#news-desk-points");

    if (!card || !summaryNode || !pointsNode) return;

    const editorial = item.editorial && typeof item.editorial === "object" ? item.editorial : {};

    const summary = text(editorial.summary || item.description);

    const points = Array.isArray(editorial.keyPoints)
      ? editorial.keyPoints.filter((point) => typeof point === "string" && point.trim()).slice(0, 3)
      : [];

    summaryNode.textContent = summary;
    summaryNode.hidden = !summary;

    pointsNode.replaceChildren();

    points.forEach((point) => {
      const li = document.createElement("li");
      li.textContent = point;
      pointsNode.appendChild(li);
    });

    pointsNode.hidden = points.length === 0;
    card.hidden = !summary && points.length === 0;
  };

  const appendRichText = (host, value) => {
    const content = text(value);
    const parts = content.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);

    parts.forEach((part) => {
      const match = part.match(/^(?:\*\*(.+)\*\*|__(.+)__)$/);

      if (!match) {
        host.appendChild(document.createTextNode(part));
        return;
      }

      const strong = document.createElement("strong");
      strong.textContent = match[1] || match[2];
      host.appendChild(strong);
    });
  };

  const normalizeForDedup = (value) =>
    String(value || "")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const appendTable = (host, inputRows) => {
    if (!Array.isArray(inputRows) || !inputRows.length) {
      return;
    }

    let rows = inputRows
      .filter(Array.isArray)
      .map((row) => row.map((cell) => String(cell ?? "").trim()));

    if (!rows.length) return;

    // Recover flattened legacy article content.
    if (rows.length === 1 && rows[0].length > 8) {
      const cells = rows[0];

      const headerIndex = cells.findIndex((cell) =>
        ["no.", "no", "s.no.", "s.no"].includes(cell.toLowerCase()),
      );

      if (headerIndex < 0) {
        const paragraph = document.createElement("p");
        paragraph.className = "article-recovered-prose";
        paragraph.textContent = cells.filter(Boolean).join(" ");

        host.appendChild(paragraph);
        return;
      }

      const leadingText = cells.slice(0, headerIndex).filter(Boolean).join(" ");

      if (leadingText) {
        const paragraph = document.createElement("p");
        paragraph.className = "article-recovered-prose";
        paragraph.textContent = leadingText;
        host.appendChild(paragraph);
      }

      const tail = cells.slice(headerIndex);

      const venueIndex = tail.findIndex((cell) => cell.toLowerCase() === "venue");

      const columnCount = venueIndex >= 0 ? venueIndex + 1 : 5;

      const recovered = [tail.slice(0, columnCount)];

      for (let index = columnCount; index + columnCount <= tail.length; index += columnCount) {
        const row = tail.slice(index, index + columnCount);

        if (row.some(Boolean)) {
          recovered.push(row);
        }
      }

      rows = recovered;
    }

    // Avoid rendering prose as an excessively wide table.
    if (rows.some((row) => row.length > 8)) {
      const paragraph = document.createElement("p");
      paragraph.className = "article-recovered-prose";
      paragraph.textContent = rows.flat().filter(Boolean).join(" ");

      host.appendChild(paragraph);
      return;
    }

    let trailingProse = "";

    rows = rows.map((row, index) => {
      const copy = [...row];
      const lastIndex = copy.length - 1;

      if (index > 0 && lastIndex >= 0 && copy[lastIndex].length > 100) {
        trailingProse = [trailingProse, copy[lastIndex]].filter(Boolean).join("\n\n");

        copy[lastIndex] = "";
      }

      return copy;
    });

    const wrapper = document.createElement("div");
    wrapper.className = "article-table-wrap";

    const table = document.createElement("table");
    table.className = "article-data-table";

    rows.forEach((cells, rowIndex) => {
      const row = document.createElement("tr");

      cells.forEach((cell) => {
        const cellNode = document.createElement(rowIndex === 0 ? "th" : "td");

        if (rowIndex === 0) {
          cellNode.scope = "col";
        }

        appendRichText(cellNode, cell);
        row.appendChild(cellNode);
      });

      table.appendChild(row);
    });

    wrapper.appendChild(table);
    host.appendChild(wrapper);

    if (trailingProse) {
      const paragraph = document.createElement("p");
      paragraph.className = "article-recovered-prose";
      paragraph.textContent = trailingProse;
      host.appendChild(paragraph);
    }
  };

  const renderBody = (host, item) => {
    if (!host) return;

    host.replaceChildren();

    const blocks = Array.isArray(item.contentBlocks) ? item.contentBlocks : [];

    if (blocks.length) {
      const tableSignatures = [];

      blocks.forEach((block) => {
        if (block?.type !== "table" || !Array.isArray(block.rows)) {
          return;
        }

        block.rows.forEach((row) => {
          if (!Array.isArray(row)) return;

          row.forEach((cell) => {
            const normalized = normalizeForDedup(cell);

            if (normalized.length >= 45) {
              tableSignatures.push(normalized);
            }
          });
        });
      });

      const seen = new Set();

      blocks.forEach((block) => {
        if (!block || typeof block !== "object") {
          return;
        }

        if (block.type === "table") {
          appendTable(host, block.rows);
          return;
        }

        const value = text(block.text);
        const normalized = normalizeForDedup(value);

        if (!normalized || seen.has(normalized)) {
          return;
        }

        const duplicateOfTable =
          normalized.length >= 45 &&
          tableSignatures.some(
            (cell) => cell === normalized || cell.includes(normalized) || normalized.includes(cell),
          );

        if (duplicateOfTable) return;

        seen.add(normalized);

        if (block.type === "heading") {
          const heading = document.createElement("h2");
          appendRichText(heading, value);
          host.appendChild(heading);
        } else if (block.type === "list") {
          const paragraph = document.createElement("p");
          paragraph.className = "article-list-item";
          paragraph.textContent = `• ${value}`;
          host.appendChild(paragraph);
        } else {
          const paragraph = document.createElement("p");
          appendRichText(paragraph, value);
          host.appendChild(paragraph);
        }
      });

      if (!host.childNodes.length) {
        renderEmptyBody(host);
      }

      return;
    }

    const raw = text(item.fullText || item.pageText);

    const source =
      Array.isArray(item.articleText) && item.articleText.length
        ? item.articleText
        : raw.split(/\n+/);

    const lines = source.map((line) => text(line)).filter((line) => line.length > 1);

    let tableRows = [];

    const flushTable = () => {
      if (!tableRows.length) return;

      appendTable(host, tableRows);
      tableRows = [];
    };

    lines.forEach((line) => {
      const marker = line.match(/^\[TABLE\](.*?)\[\/TABLE\]$/s);

      if (marker) {
        flushTable();

        try {
          appendTable(host, JSON.parse(marker[1]));
        } catch {
          const paragraph = document.createElement("p");
          paragraph.className = "article-recovered-prose";
          paragraph.textContent = marker[1];
          host.appendChild(paragraph);
        }

        return;
      }

      const cells = line
        .split(/\s+\|\s+/)
        .map((cell) => cell.trim())
        .filter(Boolean);

      if (cells.length >= 2) {
        tableRows.push(cells);
        return;
      }

      flushTable();

      if (/^\*\*[^*]{2,100}\*\*$/.test(line)) {
        const heading = document.createElement("h2");
        appendRichText(heading, line);
        host.appendChild(heading);
        return;
      }

      const paragraph = document.createElement("p");

      const label = line.match(/^([^:]{2,70}:)\s+(.+)$/);

      if (label) {
        const strong = document.createElement("strong");
        strong.textContent = `${label[1]} `;
        paragraph.appendChild(strong);
        appendRichText(paragraph, label[2]);
      } else {
        appendRichText(paragraph, line);
      }

      host.appendChild(paragraph);
    });

    flushTable();

    if (!host.childNodes.length) {
      renderEmptyBody(host);
    }
  };

  const renderEmptyBody = (host) => {
    const paragraph = document.createElement("p");

    paragraph.textContent =
      "The saved BCCI feed does not include the complete article body yet. Open the verified official source below for the original story.";

    host.appendChild(paragraph);
  };

  const setupSharing = () => {
    if (!shareButton) return;

    shareButton.addEventListener("click", async () => {
      const shareData = {
        title: document.title,
        url: location.href,
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
          return;
        }

        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(location.href);

          shareButton.textContent = "✓ Link copied";
          return;
        }

        window.prompt("Copy this article link:", location.href);
      } catch (error) {
        // Ignore a user cancelling the native share dialog.
        if (error?.name !== "AbortError") {
          console.error("Sharing failed:", error);
        }
      }
    });
  };

  const loadArticle = async () => {
    if (!status || !article || !titleNode) {
      console.error("News Details: required HTML elements are missing.");
      return;
    }

    if (!requestedId) {
      showError("No news article was selected. Please return to the news page and open a story.");
      return;
    }

    status.textContent = "Loading article details…";
    status.hidden = false;
    article.hidden = true;

    try {
      const response = await fetch(NEWS_JSON_PATH, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`News data could not be loaded (HTTP ${response.status}).`);
      }

      const data = await response.json();

      const items = Array.isArray(data) ? data : Array.isArray(data.news) ? data.news : [];

      const item = items.find(
        (news, index) =>
          (news.id !== undefined && news.id !== null && String(news.id) === requestedId) ||
          String(index) === requestedId,
      );

      if (!item) {
        throw new Error("This news item is not available in the latest saved snapshot.");
      }

      const original = safeUrl(item.webviewUrl);

      if (!original && item.manual !== true) {
        throw new Error("The original article link is not valid.");
      }

      document.title = `${text(item.title, "Tilak Varma News")} | The 72 Club`;

      titleNode.textContent = text(item.title, "Tilak Varma News");

      if (dateNode) {
        dateNode.textContent = formatDate(item.publishedAt) || "BCCI · Tilak Varma news";
      }

      if (relativeDateNode) {
        relativeDateNode.textContent = relativeDate(item.publishedAt);
      }

      renderEditorial(item);

      renderBody($("#detail-excerpt"), item);

      if (imageNode && imageFallback) {
        imageNode.hidden = true;
        imageFallback.hidden = false;
        imageNode.removeAttribute("src");

        const imageUrl = safeUrl(item.imageUrl);

        if (imageUrl) {
          imageNode.alt = text(item.title, "BCCI article image");

          imageNode.loading = "eager";
          imageNode.decoding = "async";

          imageNode.addEventListener(
            "error",
            () => {
              imageNode.hidden = true;
              imageFallback.hidden = false;
            },
            { once: true },
          );

          imageNode.addEventListener(
            "load",
            () => {
              imageNode.hidden = false;
              imageFallback.hidden = true;
            },
            { once: true },
          );

          imageNode.src = imageUrl;
        }
      }

      if (originalLink) {
        originalLink.hidden = !original;

        if (original) {
          originalLink.href = original;
          originalLink.removeAttribute("target");
          originalLink.removeAttribute("rel");
        } else {
          originalLink.removeAttribute("href");
        }
      }

      const sourceNote = $(".source-note");

      if (item.manual === true && sourceNote) {
        sourceNote.textContent =
          `Published by ${text(item.sourceName, "The 72 Club")}. ` +
          "This is a manually published fan-club news article.";
      }

      renderRelated(items, item);

      status.hidden = true;
      article.hidden = false;
    } catch (error) {
      console.error("News Details loading error:", error);

      showError(
        error instanceof TypeError
          ? "Unable to load news data. Check your connection and try again."
          : error.message || "Could not load this news item.",
      );
    }
  };

  setupSharing();
  loadArticle();
})();
