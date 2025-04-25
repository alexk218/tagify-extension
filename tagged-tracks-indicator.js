// tagmaster-indicator.js

(function TagMasterIndicator() {
  // Wait for Spicetify to be ready
  if (!Spicetify?.Platform) {
    setTimeout(TagMasterIndicator, 300);
    return;
  }

  console.log("TagMaster: Indicator extension loading...");

  const STORAGE_KEY = "tagmaster:tagData";
  let taggedTracks = {};
  let observer = null;

  // Load tagged tracks from localStorage
  function loadTaggedTracks() {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const data = JSON.parse(savedData);
        if (data && data.tracks) {
          taggedTracks = data.tracks;
          console.log(`TagMaster: Loaded ${Object.keys(taggedTracks).length} tagged tracks`);

          // Log first few tracks for debugging
          const sampleTrackIds = Object.keys(taggedTracks).slice(0, 3);
          console.log("Sample tagged tracks:", sampleTrackIds);

          return true;
        }
      }
    } catch (error) {
      console.error("TagMaster: Error loading data", error);
    }
    return false;
  }

  // Check if a track is tagged
  function isTrackTagged(trackUri) {
    return trackUri in taggedTracks;
  }

  // This is the critical function - copied from DJ Info extension
  function getTracklistTrackUri(tracklistElement) {
    let values = Object.values(tracklistElement);
    if (!values) {
      console.log("Error: Could not get tracklist element");
      return null;
    }

    try {
      return (
        values[0]?.pendingProps?.children[0]?.props?.children?.props?.uri ||
        values[0]?.pendingProps?.children[0]?.props?.children?.props?.children?.props?.uri ||
        values[0]?.pendingProps?.children[0]?.props?.children?.props?.children?.props?.children
          ?.props?.uri ||
        values[0]?.pendingProps?.children[0]?.props?.children[0]?.props?.uri
      );
    } catch (e) {
      console.log("Error getting URI from element:", e);
      return null;
    }
  }

  // Get summary of track tags
  function getTrackTagSummary(trackUri) {
    if (!isTrackTagged(trackUri)) return "";

    const track = taggedTracks[trackUri];
    let summary = [];

    if (track.rating > 0) {
      summary.push(`★ ${track.rating}`);
    }

    if (track.energy > 0) {
      summary.push(`E ${track.energy}`);
    }

    if (track.tags && track.tags.length > 0) {
      // Get tag names and deduplicate them
      const tagNames = new Set();
      track.tags.forEach((tag) => {
        // Support both tag formats
        const name = tag.tag || tag.name;
        if (name) tagNames.add(name);
      });

      // Only add tag count if there are tags
      if (tagNames.size > 0) {
        summary.push(`Tags: ${tagNames.size}`);
      }
    }

    return summary.join(" | ");
  }

  // Add column to tracklist header
  function addColumnToHeader(header) {
    if (!header || header.querySelector(".tagmaster-header")) return;

    // Find the last column to insert before
    const lastColumn = header.querySelector(".main-trackList-rowSectionEnd");
    if (!lastColumn) return;

    // Get column index and increment it for the last column
    const colIndex = parseInt(lastColumn.getAttribute("aria-colindex"));
    lastColumn.setAttribute("aria-colindex", (colIndex + 1).toString());

    // Create our new column
    const tagColumn = document.createElement("div");
    tagColumn.classList.add("main-trackList-rowSectionVariable");
    tagColumn.classList.add("tagmaster-header");
    tagColumn.setAttribute("role", "columnheader");
    tagColumn.setAttribute("aria-colindex", colIndex.toString());
    tagColumn.style.display = "flex";

    // Add a button with header text
    const headerButton = document.createElement("button");
    headerButton.classList.add("main-trackList-column");
    headerButton.classList.add("main-trackList-sortable");

    const headerText = document.createElement("span");
    headerText.classList.add("TypeElement-mesto-type");
    headerText.classList.add("standalone-ellipsis-one-line");
    headerText.textContent = "TagMaster";

    headerButton.appendChild(headerText);
    tagColumn.appendChild(headerButton);

    // Insert our column before the last column
    header.insertBefore(tagColumn, lastColumn);

    // Update grid template columns based on column count
    const fiveColumnGridCss =
      "grid-template-columns: [index] 16px [first] 3fr [var1] 2fr [var2] 2fr [var3] 1fr [last] minmax(120px,1fr) !important";
    const sixColumnGridCss =
      "grid-template-columns: [index] 16px [first] 5fr [var1] 3fr [var2] 2fr [var3] 2fr [last] minmax(120px,1fr) !important";

    switch (colIndex) {
      case 4:
        header.setAttribute("style", fiveColumnGridCss);
        break;
      case 5:
        header.setAttribute("style", sixColumnGridCss);
        break;
      default:
        break;
    }
  }

  // Add TagMaster info to track row
  function addTagInfoToTrack(row) {
    // Skip if already processed
    if (row.querySelector(".tagmaster-info")) return;

    // Get track URI using the same method as DJ Info
    const trackUri = getTracklistTrackUri(row);

    // Skip if no URI found or not a track
    if (!trackUri || !trackUri.includes("track")) return;

    // Find the last column to insert before
    const lastColumn = row.querySelector(".main-trackList-rowSectionEnd");
    if (!lastColumn) return;

    // Get column index and increment it for the last column
    const colIndex = parseInt(lastColumn.getAttribute("aria-colindex"));
    lastColumn.setAttribute("aria-colindex", (colIndex + 1).toString());

    // Create our tag info column
    const tagColumn = document.createElement("div");
    tagColumn.classList.add("main-trackList-rowSectionVariable");
    tagColumn.classList.add("tagmaster-info");
    tagColumn.setAttribute("aria-colindex", colIndex.toString());
    tagColumn.style.display = "flex";

    // Only add indicator if track is tagged
    if (isTrackTagged(trackUri)) {
      console.log(`TagMaster: Adding indicator for ${trackUri}`);

      // Create tag info element
      const text = document.createElement("p");
      text.classList.add("tagmaster-tag");
      text.style.fontSize = "12px";

      // Generate display text
      const summary = getTrackTagSummary(trackUri);
      text.innerHTML = `<span style="color:#1DB954; margin-right:4px;">●</span> ${summary}`;

      tagColumn.appendChild(text);
    }

    // Insert our column before the last column
    row.insertBefore(tagColumn, lastColumn);

    // Update grid template columns based on column count
    const fiveColumnGridCss =
      "grid-template-columns: [index] 16px [first] 3fr [var1] 2fr [var2] 2fr [var3] 1fr [last] minmax(120px,1fr) !important";
    const sixColumnGridCss =
      "grid-template-columns: [index] 16px [first] 5fr [var1] 3fr [var2] 2fr [var3] 2fr [last] minmax(120px,1fr) !important";

    switch (colIndex) {
      case 4:
        row.setAttribute("style", fiveColumnGridCss);
        break;
      case 5:
        row.setAttribute("style", sixColumnGridCss);
        break;
      default:
        break;
    }
  }

  // Process all tracks in a tracklist
  function processTracklist(tracklist) {
    if (!tracklist) return;

    // Add column to header first
    const header = tracklist.querySelector(".main-trackList-trackListHeaderRow");
    if (header) {
      addColumnToHeader(header);
    }

    // Process all track rows
    const trackRows = tracklist.querySelectorAll(".main-trackList-trackListRow");
    let taggedCount = 0;

    trackRows.forEach((row) => {
      // Check if the track is tagged before adding UI elements
      const trackUri = getTracklistTrackUri(row);
      if (trackUri && isTrackTagged(trackUri)) {
        taggedCount++;
      }

      addTagInfoToTrack(row);
    });

    console.log(
      `TagMaster: Processed ${trackRows.length} rows, found ${taggedCount} tagged tracks`
    );
  }

  // Update all tracklists on the page
  function updateTracklists() {
    const tracklists = document.getElementsByClassName("main-trackList-indexable");
    console.log(`TagMaster: Found ${tracklists.length} tracklists to process`);

    for (const tracklist of tracklists) {
      processTracklist(tracklist);
    }
  }

  // Set up mutation observer for tracking DOM changes
  function setupObserver() {
    if (observer) {
      observer.disconnect();
    }

    // This observer watches for tracklist changes
    const tracklistObserver = new MutationObserver(() => {
      updateTracklists();
    });

    // Main observer to detect when track lists are added to the DOM
    observer = new MutationObserver(async (mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          const addedTracklists = Array.from(mutation.addedNodes).filter(
            (node) =>
              node.nodeType === Node.ELEMENT_NODE &&
              (node.classList?.contains("main-trackList-indexable") ||
                node.querySelector?.(".main-trackList-indexable"))
          );

          if (addedTracklists.length > 0) {
            console.log("TagMaster: New tracklist detected, updating...");
            updateTracklists();

            // Observe each tracklist for changes
            const tracklists = document.getElementsByClassName("main-trackList-indexable");
            for (const tracklist of tracklists) {
              tracklistObserver.observe(tracklist, {
                childList: true,
                subtree: true,
              });
            }
          }
        }
      }
    });

    // Start observing the whole document
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial update
    updateTracklists();

    // Get all tracklists and observe them for changes
    const tracklists = document.getElementsByClassName("main-trackList-indexable");
    for (const tracklist of tracklists) {
      tracklistObserver.observe(tracklist, {
        childList: true,
        subtree: true,
      });
    }
  }

  // Initialize the extension
  function initialize() {
    if (loadTaggedTracks()) {
      // Initial processing
      setTimeout(updateTracklists, 500);

      // Set up observer for DOM changes
      setupObserver();

      // Periodic refresh to catch any missed updates
      setInterval(updateTracklists, 3000);

      // Setup debug utility
      window.tagmasterDebug = {
        reprocess: updateTracklists,
        getData: () => taggedTracks,
        checkTrack: (uri) => console.log(`Track ${uri} is tagged: ${isTrackTagged(uri)}`),
      };

      console.log("TagMaster: Indicator extension initialized successfully");
    } else {
      console.log("TagMaster: No tagged tracks found");
    }
  }

  // Start the extension
  initialize();
})();
