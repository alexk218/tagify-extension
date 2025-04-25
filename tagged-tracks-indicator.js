(function TagMasterIndicator() {
  // Wait for Spicetify to be ready
  if (!Spicetify?.Platform) {
    setTimeout(TagMasterIndicator, 300);
    return;
  }

  console.log("TagMaster: Indicator extension loading...");

  const STORAGE_KEY = "tagmaster:tagData";
  const PLAYLIST_CACHE_KEY = "tagmaster:playlistCache";
  const SETTINGS_KEY = "tagmaster:playlistSettings";
  let taggedTracks = {};
  let observer = null;

  function getPlaylistCache() {
    try {
      const cacheString = localStorage.getItem(PLAYLIST_CACHE_KEY);
      if (cacheString) {
        return JSON.parse(cacheString);
      }
    } catch (error) {
      console.error("TagMaster: Error reading playlist cache:", error);
    }

    // Return empty cache if not found or error
    return {
      tracks: {},
      lastUpdated: 0,
    };
  }

  function getPlaylistSettings() {
    try {
      const settingsString = localStorage.getItem(SETTINGS_KEY);
      if (settingsString) {
        return JSON.parse(settingsString);
      }
    } catch (error) {
      console.error("TagMaster: Error reading playlist settings:", error);
    }

    // Return default settings if not found or error
    return {
      excludeNonOwnedPlaylists: true,
      excludedKeywords: ["Daylist", "Unchartify", "Discover Weekly", "Release Radar"],
      excludedPlaylistIds: [],
      excludeByDescription: ["ignore"],
    };
  }

  function isPlaylistExcluded(playlistId, playlistName) {
    // Get the current playlist settings
    const settings = getPlaylistSettings();

    // Check if this is a playlist that's specifically excluded
    if (settings.excludedPlaylistIds.includes(playlistId)) return true;

    // Check for excluded keywords in name
    if (
      settings.excludedKeywords.some((keyword) =>
        playlistName.toLowerCase().includes(keyword.toLowerCase())
      )
    ) {
      return true;
    }

    // Also check hardcoded exclusions like MASTER
    if (playlistName === "MASTER") return true;

    return false;
  }

  function shouldShowLikedOnlyWarning(trackUri) {
    // Get playlist cache
    const cache = getPlaylistCache();

    // Get all playlists this track belongs to
    const containingPlaylists = cache.tracks[trackUri] || [];

    // If not in any playlists at all, don't show warning
    if (containingPlaylists.length === 0) return false;

    // Find if there's at least one non-excluded, non-Liked Songs playlist
    const hasNonExcludedPlaylists = containingPlaylists.some((playlist) => {
      // Skip Liked Songs and excluded playlists
      return playlist.id !== "liked" && !isPlaylistExcluded(playlist.id, playlist.name);
    });

    // Show warning if either:
    // 1. Only in Liked Songs, or
    // 2. Only in Liked Songs and excluded playlists
    return !hasNonExcludedPlaylists;
  }

  function getPlaylistListForTrack(trackUri) {
    // Get playlist cache
    const cache = getPlaylistCache();

    // Get all playlists this track belongs to
    const containingPlaylists = cache.tracks[trackUri] || [];

    // Filter out excluded playlists and "Liked Songs"
    const relevantPlaylists = containingPlaylists.filter((playlist) => {
      // Skip excluded playlists
      return !isPlaylistExcluded(playlist.id, playlist.name) && playlist.id !== "liked";
    });

    // If there are no relevant playlists, return empty string
    if (relevantPlaylists.length === 0) {
      return "No regular playlists";
    }

    // Extract playlist names and sort alphabetically
    const playlistNames = relevantPlaylists.map((playlist) => playlist.name).sort();

    // Join with commas and return
    return playlistNames.join(", ");
  }

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

  function hasIncompleteTags(trackUri) {
    if (!taggedTracks[trackUri]) return true;

    const track = taggedTracks[trackUri];

    // Check if any of these are missing
    const missingRating = track.rating === 0 || track.rating === undefined;
    const missingEnergy = track.energy === 0 || track.energy === undefined;
    const missingTags = !track.tags || track.tags.length === 0;

    // Return true if any are missing
    return missingRating || missingEnergy || missingTags;
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
    tagColumn.style.alignItems = "center";
    tagColumn.style.justifyContent = "space-between"; // This helps with alignment

    // Check if track is tagged
    const isTagged = isTrackTagged(trackUri);

    // Check if we should show the warning icon
    const needsWarning = shouldShowLikedOnlyWarning(trackUri);

    // Create a structured layout for consistent positioning
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.width = "100%";
    container.style.alignItems = "center";
    container.style.justifyContent = "space-between";

    // Create the tag info element (left side)
    const tagInfo = document.createElement("div");
    tagInfo.style.display = "flex";
    tagInfo.style.alignItems = "center";

    if (isTagged) {
      const summary = getTrackTagSummary(trackUri);
      const tagText = document.createElement("div");

      // Check if track has incomplete tags
      const incomplete = hasIncompleteTags(trackUri);

      // Use orange bullet for incomplete tags, green for complete tags
      const bulletColor = incomplete ? "#FFA500" : "#1DB954";

      tagText.innerHTML = `<span style="color:${bulletColor}; margin-right:4px;">●</span> <span class="tag-summary">${summary}</span>`;
      tagText.style.fontSize = "12px";

      // Add tooltip with detailed tag list
      if (
        trackUri in taggedTracks &&
        taggedTracks[trackUri].tags &&
        taggedTracks[trackUri].tags.length > 0
      ) {
        const tagList = createTagListTooltip(trackUri);
        tagText.title = tagList;
      }

      tagInfo.appendChild(tagText);
    }

    container.appendChild(tagInfo);

    // Add status indicator at the right side (warning or success)
    const statusContainer = document.createElement("div");
    statusContainer.style.marginLeft = "auto";

    if (needsWarning) {
      // Add warning icon for tracks only in Liked Songs or excluded playlists
      const warningIcon = document.createElement("span");
      warningIcon.innerHTML = "⚠️";
      warningIcon.style.color = "#ffcc00";
      warningIcon.style.fontSize = "12px";
      warningIcon.title = "This track is only in Liked Songs or excluded playlists";
      statusContainer.appendChild(warningIcon);
    } else {
      // Add success icon for tracks in regular playlists
      const successIcon = document.createElement("span");
      successIcon.innerHTML = "✓";
      successIcon.style.color = "#1DB954"; // Spotify green
      successIcon.style.fontSize = "12px";
      successIcon.style.fontWeight = "bold";

      // Add the list of playlists as a tooltip
      const playlistList = getPlaylistListForTrack(trackUri);
      successIcon.title = `${playlistList}`;

      statusContainer.appendChild(successIcon);
    }

    container.appendChild(statusContainer);
    tagColumn.appendChild(container);

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

  // Function to create a formatted tooltip with all tags from a track
  function createTagListTooltip(trackUri) {
    if (
      !taggedTracks[trackUri] ||
      !taggedTracks[trackUri].tags ||
      taggedTracks[trackUri].tags.length === 0
    ) {
      return "";
    }

    const track = taggedTracks[trackUri];

    // Collect and organize all tags
    const tagsByCategory = {};

    // Process tags that have category structure (newer format)
    const structuredTags = track.tags.filter(
      (tag) => tag.categoryId && tag.subcategoryId && tag.tagId
    );

    if (structuredTags.length > 0) {
      // Get category data from localStorage if available
      let categories = [];
      try {
        const tagDataString = localStorage.getItem("tagmaster:tagData");
        if (tagDataString) {
          const tagData = JSON.parse(tagDataString);
          if (tagData && tagData.categories) {
            categories = tagData.categories;
          }
        }
      } catch (error) {
        console.error("Error loading categories:", error);
      }

      // Process structured tags
      structuredTags.forEach((tag) => {
        // Try to find category and subcategory names
        let categoryName = "Other";
        let subcategoryName = "";
        let tagName = "";

        const category = categories.find((c) => c.id === tag.categoryId);
        if (category) {
          categoryName = category.name;
          const subcategory = category.subcategories.find((s) => s.id === tag.subcategoryId);
          if (subcategory) {
            subcategoryName = subcategory.name;
            const tagObj = subcategory.tags.find((t) => t.id === tag.tagId);
            if (tagObj) {
              tagName = tagObj.name;
            }
          }
        }

        // Add to organized structure - keeping structure but we'll just use it for organization
        if (!tagsByCategory[categoryName]) {
          tagsByCategory[categoryName] = {};
        }
        if (!tagsByCategory[categoryName][subcategoryName]) {
          tagsByCategory[categoryName][subcategoryName] = [];
        }
        if (tagName) {
          tagsByCategory[categoryName][subcategoryName].push(tagName);
        }
      });

      // Format the tooltip content
      // Just show tag names grouped by their categories and subcategories
      const tagLines = [];
      Object.entries(tagsByCategory).forEach(([_category, subcategories]) => {
        Object.entries(subcategories).forEach(([_subcategory, tags]) => {
          if (tags.length > 0) {
            // Just add the tag names, comma separated
            tagLines.push(tags.join(", "));
          }
        });
      });

      if (tagLines.length > 0) {
        return tagLines.join("\n");
      }
    } else {
      // Handle older format tags
      const simpleTags = track.tags.filter((tag) => tag.tag).map((tag) => tag.tag);
      if (simpleTags.length > 0) {
        return simpleTags.join(", ");
      }
    }

    return "";
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
