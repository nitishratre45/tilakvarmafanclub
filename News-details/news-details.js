(() => {
  "use strict";
  const status = document.getElementById("detail-status");
  const article = document.getElementById("news-article");
  const params = new URLSearchParams(location.search);
  const id = params.get("id") || "";
  const safeUrl = (value) => {
    try { const url = new URL(value, location.href); return url.protocol === "https:" ? url.href : ""; }
    catch (_) { return ""; }
  };
  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IN", {timeZone:"Asia/Kolkata",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}).format(date) + " IST";
  };
  const relativeDate = (value) => {
    if (!value) return "BCCI · News";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
    if (days === 0) return "Today";
    if (days === 1) return "1 day ago";
    if (days < 30) return days + "d ago";
    return formatDate(value);
  };
  const makeThumb = (url, title) => {
    const imageUrl = safeUrl(url);
    const node = document.createElement(imageUrl ? "img" : "div");
    node.className = "related-thumb" + (imageUrl ? "" : " related-thumb-fallback");
    if (imageUrl) { node.src = imageUrl; node.alt = title || "Related news thumbnail"; node.loading = "lazy"; node.onerror = () => { node.replaceWith(makeThumb("", title)); }; }
    else node.textContent = "72";
    return node;
  };
  const renderRelated = (items, current) => {
    const list = document.getElementById("related-stories");
    const others = items.filter((item) => item !== current).slice(0, 5);
    document.getElementById("related-count").textContent = items.length + " STORIES";
    list.replaceChildren();
    if (!others.length) { const p=document.createElement("p");p.className="related-loading";p.textContent="More stories will appear here as the news archive grows.";list.appendChild(p);return; }
    others.forEach((item, index) => {
      const card=document.createElement("article");card.className="related-card";
      const copy=document.createElement("div");copy.className="related-copy";
      const category=document.createElement("div");category.className="related-category";category.textContent=item.category||"Press Releases";
      const link=document.createElement("a");link.className="related-title";link.href="index.html?id="+encodeURIComponent(item.id||String(index));link.textContent=item.title||"Tilak Varma news update";
      const date=document.createElement("div");date.className="related-date";date.textContent=relativeDate(item.publishedAt);
      copy.append(category,link,date);card.append(copy,makeThumb(item.imageUrl,item.title));list.appendChild(card);
    });
  };
  const renderEditorial = (item) => {
    const editorial = item && item.editorial && typeof item.editorial === "object" ? item.editorial : {};
    const summary = String(editorial.summary || item.description || "").trim();
    const points = Array.isArray(editorial.keyPoints) ? editorial.keyPoints.filter(x => typeof x === "string" && x.trim()).slice(0, 3) : [];
    const card = document.getElementById("news-desk-card");
    const summaryNode = document.getElementById("news-desk-summary");
    const list = document.getElementById("news-desk-points");
    summaryNode.textContent = summary;
    list.replaceChildren();
    points.forEach(value => { const li=document.createElement("li"); li.textContent=value; list.appendChild(li); });
    card.hidden = !summary && !points.length;
    summaryNode.hidden = !summary;
    list.hidden = !points.length;
  };
  const appendRichText = (host, value) => {
    const text = String(value || "");
    const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
    parts.forEach((part) => {
      const match = part.match(/^(?:\*\*(.+)\*\*|__(.+)__)$/);
      if (match) { const strong=document.createElement("strong");strong.textContent=match[1]||match[2];host.appendChild(strong); }
      else host.appendChild(document.createTextNode(part));
    });
  };
  const appendTable = (host, inputRows) => {
    if (!Array.isArray(inputRows) || !inputRows.length) return;
    let rows = inputRows.filter(Array.isArray).map(row => row.map(cell => String(cell ?? "").trim()));
    // Legacy JSON sometimes stores an entire article paragraph as one table row.
    // Keep prose readable rather than creating dozens of one-character columns.
    if (rows.length === 1 && rows[0].length > 8) {
      const cells = rows[0];
      const headerIndex = cells.findIndex(cell => ["no.", "no", "s.no.", "s.no"].includes(cell.toLowerCase()));
      if (headerIndex < 0) {
        const p = document.createElement("p");
        p.className = "article-recovered-prose";
        p.textContent = cells.filter(Boolean).join(" ");
        host.appendChild(p);
        return;
      }
      const leadingText = cells.slice(0, headerIndex).filter(Boolean).join(" ");
      if (leadingText) {
        const p = document.createElement("p");
        p.className = "article-recovered-prose";
        p.textContent = leadingText;
        host.appendChild(p);
      }
      const tail = cells.slice(headerIndex);
      const venueIndex = tail.findIndex(cell => cell.toLowerCase() === "venue");
      const columnCount = venueIndex >= 0 ? venueIndex + 1 : 5;
      const recovered = [tail.slice(0, columnCount)];
      for (let i = columnCount; i + columnCount <= tail.length; i += columnCount) {
        const row = tail.slice(i, i + columnCount);
        if (row.some(Boolean)) recovered.push(row);
      }
      rows = recovered;
    }
    if (rows.some(row => row.length > 8)) {
      const p = document.createElement("p");
      p.className = "article-recovered-prose";
      p.textContent = rows.flat().filter(Boolean).join(" ");
      host.appendChild(p);
      return;
    }

    // Prevent article copy accidentally appended to the final table cell
    // (common in flattened BCCI pages) from stretching the Venue column.
    let trailingProse = "";
    rows = rows.map((row, index) => {
      const copy = [...row];
      const last = copy.length - 1;
      if (index > 0 && last >= 0 && copy[last].length > 100) {
        trailingProse = [trailingProse, copy[last]].filter(Boolean).join("\n\n");
        copy[last] = "";
      }
      return copy;
    });

    const wrap = document.createElement("div");
    wrap.className = "article-table-wrap";
    const table = document.createElement("table");
    table.className = "article-data-table";
    rows.forEach((cells, rowIndex) => {
      const tr = document.createElement("tr");
      cells.forEach(cell => {
        const td = document.createElement(rowIndex === 0 ? "th" : "td");
        appendRichText(td, cell);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    host.appendChild(wrap);
    if (trailingProse) {
      const p = document.createElement("p");
      p.className = "article-recovered-prose";
      p.textContent = trailingProse;
      host.appendChild(p);
    }
  };

  const normalizeForDedup = (value) => String(value || "")
    .toLocaleLowerCase()
    .replace(/[^\\p{L}\\p{N}]+/gu, " ")
    .replace(/\\s+/g, " ")
    .trim();

  const renderBody = (host, item) => {
    host.replaceChildren();
    const blocks = Array.isArray(item.contentBlocks) ? item.contentBlocks : [];
    if (blocks.length) {
      // BCCI's flattened page text can contain a table and then repeat its
      // last row as ordinary prose. Build signatures from meaningful table
      // cells and suppress only exact/near-exact duplicate content.
      const tableSignatures = [];
      blocks.forEach((block) => {
        if (block && block.type === "table" && Array.isArray(block.rows)) {
          block.rows.forEach((row) => {
            if (!Array.isArray(row)) return;
            row.forEach((cell) => {
              const normalized = normalizeForDedup(cell);
              if (normalized.length >= 45) tableSignatures.push(normalized);
            });
          });
        }
      });
      const seen = new Set();
      blocks.forEach((block) => {
        if (!block || typeof block !== "object") return;
        if (block.type === "table") { appendTable(host, block.rows); return; }
        const value=String(block.text||"").trim(); if(!value) return;
        const normalized = normalizeForDedup(value);
        if (!normalized) return;
        if (seen.has(normalized)) return;
        // Avoid repeating long squad/venue notes already shown inside a table.
        if (normalized.length >= 45 && tableSignatures.some((cell) =>
          cell === normalized || cell.includes(normalized) || normalized.includes(cell)
        )) return;
        seen.add(normalized);
        if(block.type==="heading"){const h=document.createElement("h2");appendRichText(h,value);host.appendChild(h);}
        else if(block.type==="list"){const li=document.createElement("p");li.className="article-list-item";li.textContent="• "+value;host.appendChild(li);}
        else {const p=document.createElement("p");appendRichText(p,value);host.appendChild(p);}
      });
      return;
    }
    const raw=String(item.fullText||item.pageText||"");
    const source=Array.isArray(item.articleText)&&item.articleText.length?item.articleText:raw.split(/\n+/);
    const lines=source.map(x=>String(x||"").trim()).filter(x=>x.length>1);
    let tableRows=[];
    const flushTable=()=>{if(tableRows.length){appendTable(host,tableRows);tableRows=[];}};
    lines.forEach((line)=>{
      const marker=line.match(/^\[TABLE\](.*?)\[\/TABLE\]$/s);
      if(marker){flushTable();try{appendTable(host,JSON.parse(marker[1]));}catch(_){}return;}
      const cells=line.split(/\s+\|\s+/).map(x=>x.trim()).filter(Boolean);
      if(cells.length>=2){tableRows.push(cells);return;} flushTable();
      if(/^\*\*[^*]{2,100}\*\*$/.test(line)){const h=document.createElement("h2");appendRichText(h,line);host.appendChild(h);return;}
      const p=document.createElement("p");
      const label=line.match(/^([^:]{2,70}:)\s+(.+)$/);
      if(label){const strong=document.createElement("strong");strong.textContent=label[1]+" ";p.appendChild(strong);appendRichText(p,label[2]);}
      else appendRichText(p,line);
      host.appendChild(p);
    });
    flushTable();
    if(!host.childNodes.length){const p=document.createElement("p");p.textContent="The saved BCCI feed does not include the complete article body yet. Open the verified official source below for the original story.";host.appendChild(p);}
  };
  document.getElementById("share-article").addEventListener("click", async () => {
    try { if(navigator.share) await navigator.share({title:document.title,url:location.href}); else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(location.href);document.getElementById("share-article").textContent="✓ Link copied";} else window.prompt("Copy this article link:",location.href); } catch (_) {}
  });
  fetch("../News/newsjson.json",{cache:"no-store"})
    .then(response=>{if(!response.ok)throw new Error("News JSON unavailable. Please return to the news page and try again.");return response.json();})
    .then(data=>{
      const items=Array.isArray(data.news)?data.news:[];
      const item=items.find((news,index)=>(news.id&&String(news.id)===id)||String(index)===id);
      if(!item)throw new Error("This news item is not available in the latest saved snapshot.");
      const original=safeUrl(item.webviewUrl);
      if(!original && item.manual !== true)throw new Error("The original article link is not valid.");
      document.title=(item.title||"Tilak Varma News")+" | The 72 Club";
      document.getElementById("detail-title").textContent=item.title||"Tilak Varma News";
      document.getElementById("detail-date").textContent=formatDate(item.publishedAt)||"BCCI · Tilak Varma news";
      document.getElementById("detail-relative-date").textContent=relativeDate(item.publishedAt);
      renderEditorial(item);
      renderBody(document.getElementById("detail-excerpt"),item);
      const image=document.getElementById("detail-image");const imageUrl=safeUrl(item.imageUrl);
      if(imageUrl){image.src=imageUrl;image.alt=item.title||"BCCI article image";image.hidden=false;document.getElementById("image-fallback").hidden=true;image.onerror=()=>{image.hidden=true;document.getElementById("image-fallback").hidden=false;};}
      const originalLink=document.getElementById("original-link");
      originalLink.hidden=!original;
      if(original) originalLink.href=original;
      const sourceNote=document.querySelector(".source-note");
      if(item.manual===true && sourceNote) sourceNote.textContent="Published by "+(item.sourceName||"The 72 Club")+". This is a manually published fan-club news article.";
      renderRelated(items,item);status.hidden=true;article.hidden=false;
    })
    .catch(error=>{status.textContent=error.message||"Could not load this news item.";document.getElementById("related-stories").textContent="Related stories are temporarily unavailable.";});
})();