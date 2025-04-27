(function TagifyExtension() {
  // Wait for Spicetify to be ready
  if (!(Spicetify?.Platform && Spicetify?.CosmosAsync)) {
    setTimeout(TagifyExtension, 300);
    return;
  }

  const APP_NAME = "tagify";
  const VERSION = "1.0.0";

  // Shared constants
  const STORAGE_KEY = "tagify:tagData";
  const PLAYLIST_CACHE_KEY = "tagify:playlistCache";
  const SETTINGS_KEY = "tagify:playlistSettings";

  console.log(`Tagify: Extension loading (v${VERSION})...`);

  // Shared state
  const state = {
    taggedTracks: {},
    observer: null,
    nowPlayingWidgetTagInfo: null,
    lastTrackUri: null,
    initialized: {
      menu: false,
      indicator: false,
      playbar: false,
    },
  };

  // Shared utilities
  const utils = {
    /**
     * Load tagged tracks from localStorage
     * @returns {boolean} Whether data was successfully loaded
     */
    loadTaggedTracks: function () {
      try {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (savedData) {
          const data = JSON.parse(savedData);
          if (data && data.tracks) {
            state.taggedTracks = data.tracks;
            console.log(`Tagify: Loaded ${Object.keys(state.taggedTracks).length} tagged tracks`);
            return true;
          }
        }
      } catch (error) {
        console.error("Tagify: Error loading data", error);
      }
      return false;
    },

    /**
     * Check if a track is tagged
     * @param {string} trackUri - The track URI to check
     * @returns {boolean} Whether the track is tagged
     */
    isTrackTagged: function (trackUri) {
      return trackUri in state.taggedTracks;
    },

    /**
     * Get playlist cache from localStorage
     * @returns {Object} The playlist cache
     */
    getPlaylistCache: function () {
      try {
        const cacheString = localStorage.getItem(PLAYLIST_CACHE_KEY);
        if (cacheString) {
          return JSON.parse(cacheString);
        }
      } catch (error) {
        console.error("Tagify: Error reading playlist cache:", error);
      }

      // Return empty cache if not found or error
      return {
        tracks: {},
        lastUpdated: 0,
      };
    },

    /**
     * Get playlist settings from localStorage
     * @returns {Object} The playlist settings
     */
    getPlaylistSettings: function () {
      try {
        const settingsString = localStorage.getItem(SETTINGS_KEY);
        if (settingsString) {
          return JSON.parse(settingsString);
        }
      } catch (error) {
        console.error("Tagify: Error reading playlist settings:", error);
      }

      // Return default settings if not found or error
      return {
        excludeNonOwnedPlaylists: true,
        excludedKeywords: ["Daylist", "Unchartify", "Discover Weekly", "Release Radar"],
        excludedPlaylistIds: [],
        excludeByDescription: ["ignore"],
      };
    },

    /**
     * Check if a playlist is excluded based on settings
     * @param {string} playlistId - The playlist ID
     * @param {string} playlistName - The playlist name
     * @returns {boolean} Whether the playlist is excluded
     */
    isPlaylistExcluded: function (playlistId, playlistName) {
      const settings = this.getPlaylistSettings();

      if (settings.excludedPlaylistIds.includes(playlistId)) return true;

      if (
        settings.excludedKeywords.some((keyword) =>
          playlistName.toLowerCase().includes(keyword.toLowerCase())
        )
      ) {
        return true;
      }

      if (playlistName === "MASTER" || playlistName === "TAGGED") return true;

      return false;
    },

    /**
     * Check if a track should show a warning for being only in Liked Songs
     * @param {string} trackUri - The track URI to check
     * @returns {boolean} Whether to show the warning
     */
    shouldShowLikedOnlyWarning: function (trackUri) {
      const cache = this.getPlaylistCache();
      const containingPlaylists = cache.tracks[trackUri] || [];

      if (containingPlaylists.length === 0) return false;

      const hasNonExcludedPlaylists = containingPlaylists.some((playlist) => {
        return playlist.id !== "liked" && !this.isPlaylistExcluded(playlist.id, playlist.name);
      });

      return !hasNonExcludedPlaylists;
    },

    /**
     * Get playlist list for a track as a string
     * @param {string} trackUri - The track URI
     * @returns {string} Comma-separated list of playlists
     */
    getPlaylistListForTrack: function (trackUri) {
      const cache = this.getPlaylistCache();
      const containingPlaylists = cache.tracks[trackUri] || [];

      const relevantPlaylists = containingPlaylists.filter((playlist) => {
        return !this.isPlaylistExcluded(playlist.id, playlist.name) && playlist.id !== "liked";
      });

      if (relevantPlaylists.length === 0) {
        return "No regular playlists";
      }

      const playlistNames = relevantPlaylists.map((playlist) => playlist.name).sort();
      return playlistNames.join(", ");
    },

    /**
     * Check if a track has incomplete tags
     * @param {string} trackUri - The track URI to check
     * @returns {boolean} Whether the track has incomplete tags
     */
    hasIncompleteTags: function (trackUri) {
      if (!state.taggedTracks[trackUri]) return true;

      const track = state.taggedTracks[trackUri];

      const missingRating = track.rating === 0 || track.rating === undefined;
      const missingEnergy = track.energy === 0 || track.energy === undefined;
      const missingTags = !track.tags || track.tags.length === 0;

      return missingRating || missingEnergy || missingTags;
    },

    /**
     * Get summary of track tags
     * @param {string} trackUri - The track URI
     * @returns {string} Summary of track tags
     */
    getTrackTagSummary: function (trackUri) {
      if (!this.isTrackTagged(trackUri)) return "";

      const track = state.taggedTracks[trackUri];
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
    },

    /**
     * Extract track URI from playlist row element
     * @param {HTMLElement} tracklistElement - The playlist row element
     * @returns {string|null} The track URI
     */
    getTracklistTrackUri: function (tracklistElement) {
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
    },

    /**
     * Wait for an element to exist in the DOM
     * @param {string} selector - CSS selector to wait for
     * @returns {Promise<HTMLElement>} The found element
     */
    waitForElement: async function (selector) {
      while (!document.querySelector(selector)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return document.querySelector(selector);
    },
  };

  // Context menu feature
  const menuFeature = {
    /**
     * Initialize the context menu feature
     */
    initialize: function () {
      if (state.initialized.menu) return;

      if (!Spicetify.ContextMenu) {
        console.warn("Tagify: Spicetify.ContextMenu not available, menu feature disabled");
        return;
      }

      try {
        // Create menu item
        new Spicetify.ContextMenu.Item(
          "Tag with Tagify",
          this.handleMenuClick,
          this.shouldShowMenu,
          `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.41,11.58L12.41,2.58C12.04,2.21 11.53,2 11,2H4C2.9,2 2,2.9 2,4V11C2,11.53 2.21,12.04 2.59,12.42L11.59,21.42C11.96,21.79 12.47,22 13,22C13.53,22 14.04,21.79 14.41,21.42L21.41,14.42C21.79,14.04 22,13.53 22,13C22,12.47 21.79,11.96 21.41,11.58M5.5,7C4.67,7 4,6.33 4,5.5C4,4.67 4.67,4 5.5,4C6.33,4 7,4.67 7,5.5C7,6.33 6.33,7 5.5,7Z"/>
          </svg>`
        ).register();

        console.log("Tagify: Menu feature initialized");
        state.initialized.menu = true;
      } catch (error) {
        console.error("Tagify: Error initializing menu feature:", error);
      }
    },

    /**
     * Determine whether to show the menu item
     * @param {string[]} uris - The URIs of the selected items
     * @returns {boolean} Whether to show the menu
     */
    shouldShowMenu: function (uris) {
      return uris.some(
        (uri) => uri.startsWith("spotify:track:") || uri.startsWith("spotify:local:")
      );
    },

    /**
     * Handle the menu item click
     * @param {string[]} uris - The URIs of the selected items
     */
    handleMenuClick: function (uris) {
      if (uris.length === 0) return;

      if (uris.length === 1) {
        // Single track selection - use standard navigation
        const trackUri = uris[0];

        Spicetify.Platform.History.push({
          pathname: `/${APP_NAME}`,
          search: `?uri=${encodeURIComponent(trackUri)}`,
          state: { trackUri },
        });
      } else {
        // We'll encode the array of URIs for the URL (you could also use state)
        const encodedUris = encodeURIComponent(JSON.stringify(uris));

        Spicetify.Platform.History.push({
          pathname: `/${APP_NAME}`,
          search: `?uris=${encodedUris}`,
          state: { trackUris: uris },
        });
      }
    },
  };

  // Tracklist indicator feature
  const indicatorFeature = {
    /**
     * Initialize the tracklist indicator feature
     */
    initialize: function () {
      if (state.initialized.indicator) return;

      console.log("Tagify: Initializing tracklist indicator feature...");

      try {
        // Set up mutation observer
        this.setupObserver();

        // Initial processing
        setTimeout(this.updateTracklists, 500);

        // Periodic refresh to catch any missed updates
        setInterval(this.updateTracklists, 3000);

        // Setup debug utility
        window.tagifyDebug = {
          reprocess: this.updateTracklists,
          getData: () => state.taggedTracks,
          checkTrack: (uri) => console.log(`Track ${uri} is tagged: ${utils.isTrackTagged(uri)}`),
        };

        state.initialized.indicator = true;
      } catch (error) {
        console.error("Tagify: Error initializing indicator feature:", error);
      }
    },

    /**
     * Set up mutation observer for tracking DOM changes
     */
    setupObserver: function () {
      if (state.observer) {
        state.observer.disconnect();
      }

      // This observer watches for tracklist changes
      const tracklistObserver = new MutationObserver(() => {
        indicatorFeature.updateTracklists();
      });

      // Main observer to detect when track lists are added to the DOM
      state.observer = new MutationObserver(async (mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            const addedTracklists = Array.from(mutation.addedNodes).filter(
              (node) =>
                node.nodeType === Node.ELEMENT_NODE &&
                (node.classList?.contains("main-trackList-indexable") ||
                  node.querySelector?.(".main-trackList-indexable"))
            );

            if (addedTracklists.length > 0) {
              console.log("Tagify: New tracklist detected, updating...");
              indicatorFeature.updateTracklists();

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
      state.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Get all tracklists and observe them for changes
      const tracklists = document.getElementsByClassName("main-trackList-indexable");
      for (const tracklist of tracklists) {
        tracklistObserver.observe(tracklist, {
          childList: true,
          subtree: true,
        });
      }
    },

    /**
     * Update all tracklists on the page
     */
    updateTracklists: function () {
      const tracklists = document.getElementsByClassName("main-trackList-indexable");
      // console.log(`Tagify: Found ${tracklists.length} tracklists to process`);

      for (const tracklist of tracklists) {
        indicatorFeature.processTracklist(tracklist);
      }
    },

    /**
     * Process all tracks in a tracklist
     * @param {HTMLElement} tracklist - The tracklist to process
     */
    processTracklist: function (tracklist) {
      if (!tracklist) return;

      // Add column to header first
      const header = tracklist.querySelector(".main-trackList-trackListHeaderRow");
      if (header) {
        indicatorFeature.addColumnToHeader(header);
      }

      // Process all track rows
      const trackRows = tracklist.querySelectorAll(".main-trackList-trackListRow");
      let taggedCount = 0;

      trackRows.forEach((row) => {
        // Check if the track is tagged before adding UI elements
        const trackUri = utils.getTracklistTrackUri(row);
        if (trackUri && utils.isTrackTagged(trackUri)) {
          taggedCount++;
        }

        indicatorFeature.addTagInfoToTrack(row);
      });

      console
        .log
        // `Tagify: Processed ${trackRows.length} rows, found ${taggedCount} tagged tracks`
        ();
    },

    /**
     * Add column to tracklist header
     * @param {HTMLElement} header - The header element
     */
    addColumnToHeader: function (header) {
      if (!header || header.querySelector(".tagify-header")) return;

      // Find the last column to insert before
      const lastColumn = header.querySelector(".main-trackList-rowSectionEnd");
      if (!lastColumn) return;

      // Get column index and increment it for the last column
      const colIndex = parseInt(lastColumn.getAttribute("aria-colindex"));
      lastColumn.setAttribute("aria-colindex", (colIndex + 1).toString());

      // Create our new column
      const tagColumn = document.createElement("div");
      tagColumn.classList.add("main-trackList-rowSectionVariable");
      tagColumn.classList.add("tagify-header");
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
      headerText.textContent = "Tagify";

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
    },

    /**
     * Add Tagify info to track row
     * @param {HTMLElement} row - The track row element
     */
    addTagInfoToTrack: function (row) {
      // Skip if already processed
      if (row.querySelector(".tagify-info")) return;

      // Get track URI
      const trackUri = utils.getTracklistTrackUri(row);

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
      tagColumn.classList.add("tagify-info");
      tagColumn.setAttribute("aria-colindex", colIndex.toString());
      tagColumn.style.display = "flex";
      tagColumn.style.alignItems = "center";
      tagColumn.style.justifyContent = "space-between"; // This helps with alignment

      // Make the entire column clickable
      tagColumn.style.cursor = "pointer";
      tagColumn.onclick = (e) => {
        // Prevent default row click behavior
        e.stopPropagation();

        // Navigate to Tagify with this track
        Spicetify.Platform.History.push({
          pathname: `/${APP_NAME}`,
          search: `?uri=${encodeURIComponent(trackUri)}`,
          state: { trackUri },
        });
      };

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

      // Check if track is tagged
      const isTagged = utils.isTrackTagged(trackUri);

      if (isTagged) {
        const summary = utils.getTrackTagSummary(trackUri);
        const tagText = document.createElement("div");

        // Check if track has incomplete tags
        const incomplete = utils.hasIncompleteTags(trackUri);

        // Use orange bullet for incomplete tags, green for complete tags
        const bulletColor = incomplete ? "#FFA500" : "#1DB954";

        tagText.innerHTML = `<span style="color:${bulletColor}; margin-right:4px;">●</span> <span class="tag-summary">${summary}</span>`;
        tagText.style.fontSize = "12px";

        // Add tooltip with detailed tag list
        if (
          trackUri in state.taggedTracks &&
          state.taggedTracks[trackUri].tags &&
          state.taggedTracks[trackUri].tags.length > 0
        ) {
          const tagList = indicatorFeature.createTagListTooltip(trackUri);
          tagText.title = tagList;
        }

        tagInfo.appendChild(tagText);
      }

      container.appendChild(tagInfo);

      // Add warning at the right side
      const statusContainer = document.createElement("div");
      statusContainer.style.marginLeft = "auto"; // Push to the right

      // Check if we should show the warning icon
      const needsWarning = utils.shouldShowLikedOnlyWarning(trackUri);
      const playlistList = utils.getPlaylistListForTrack(trackUri);

      if (needsWarning) {
        // Add warning icon for tracks only in Liked Songs or excluded playlists
        const warningIcon = document.createElement("span");
        warningIcon.innerHTML = "⚠️";
        warningIcon.style.color = "#ffcc00";
        warningIcon.style.fontSize = "12px";
        warningIcon.title = "This track is only in Liked Songs or excluded playlists";
        statusContainer.appendChild(warningIcon);
      } else if (playlistList !== "No regular playlists") {
        // Only add success icon if the track is actually in at least one regular playlist
        const successIcon = document.createElement("span");
        successIcon.innerHTML = "✓";
        successIcon.style.color = "#1DB954"; // Spotify green
        successIcon.style.fontSize = "12px";
        successIcon.style.fontWeight = "bold";

        // Add the list of playlists as a tooltip
        successIcon.title = `In playlists: ${playlistList}`;

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
    },

    /**
     * Create a formatted tooltip with all tags from a track
     * @param {string} trackUri - The track URI
     * @returns {string} Formatted tooltip text
     */
    createTagListTooltip: function (trackUri) {
      if (
        !state.taggedTracks[trackUri] ||
        !state.taggedTracks[trackUri].tags ||
        state.taggedTracks[trackUri].tags.length === 0
      ) {
        return "";
      }

      const track = state.taggedTracks[trackUri];

      // Process tags that have category structure (newer format)
      const structuredTags = track.tags.filter(
        (tag) => tag.categoryId && tag.subcategoryId && tag.tagId
      );

      if (structuredTags.length > 0) {
        // Get category data from localStorage if available
        let categories = [];
        try {
          const tagDataString = localStorage.getItem("tagify:tagData");
          if (tagDataString) {
            const tagData = JSON.parse(tagDataString);
            if (tagData && tagData.categories) {
              categories = tagData.categories;
            }
          }
        } catch (error) {
          console.error("Error loading categories:", error);
        }

        // Process structured tags with categories
        if (categories.length > 0) {
          const tagsByCategory = {};

          structuredTags.forEach((tag) => {
            const category = categories.find((c) => c.id === tag.categoryId);
            if (category) {
              const categoryName = category.name;
              const subcategory = category.subcategories.find((s) => s.id === tag.subcategoryId);
              if (subcategory) {
                const subcategoryName = subcategory.name;
                const tagObj = subcategory.tags.find((t) => t.id === tag.tagId);
                if (tagObj) {
                  const tagName = tagObj.name;

                  if (!tagsByCategory[categoryName]) {
                    tagsByCategory[categoryName] = {};
                  }
                  if (!tagsByCategory[categoryName][subcategoryName]) {
                    tagsByCategory[categoryName][subcategoryName] = [];
                  }
                  tagsByCategory[categoryName][subcategoryName].push(tagName);
                }
              }
            }
          });

          const tagLines = [];
          Object.entries(tagsByCategory).forEach(([_category, subcategories]) => {
            Object.entries(subcategories).forEach(([_subcategory, tags]) => {
              if (tags.length > 0) {
                tagLines.push(tags.join(", "));
              }
            });
          });

          if (tagLines.length > 0) {
            return tagLines.join("\n");
          }
        }
      }

      // Handle older format tags as fallback
      const simpleTags = track.tags.filter((tag) => tag.tag).map((tag) => tag.tag);
      if (simpleTags.length > 0) {
        return simpleTags.join(", ");
      }

      return "";
    },
  };

  // Playbar feature
  const playbarFeature = {
    /**
     * Initialize the playbar feature
     */
    initialize: async function () {
      if (state.initialized.playbar) return;

      try {
        // Wait for Player to be ready
        while (!Spicetify.Player || !Spicetify.Player.data) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Add listener for song changes
        Spicetify.Player.addEventListener("songchange", this.updateNowPlayingWidget);

        // Initial update
        setTimeout(this.updateNowPlayingWidget, 1000);

        // Create a MutationObserver to watch for DOM changes
        const observer = new MutationObserver(() => {
          // Check if Now Playing widget might have been recreated
          if (!document.contains(state.nowPlayingWidgetTagInfo)) {
            state.nowPlayingWidgetTagInfo = null;
            this.updateNowPlayingWidget();
          }
        });

        // Start observing the body
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        console.log("Tagify: Playbar feature initialized successfully");
        state.initialized.playbar = true;
      } catch (error) {
        console.error("Tagify: Error initializing playbar feature:", error);
      }
    },

    /**
     * Update the Now Playing widget
     */
    updateNowPlayingWidget: async function () {
      try {
        // Get the current track URI
        const trackUri = Spicetify.Player.data?.item?.uri;
        if (!trackUri || !trackUri.includes("track")) {
          if (state.nowPlayingWidgetTagInfo) {
            state.nowPlayingWidgetTagInfo.style.display = "none";
          }
          return;
        }

        // Skip if URI hasn't changed and element exists
        if (trackUri === state.lastTrackUri && state.nowPlayingWidgetTagInfo) return;
        state.lastTrackUri = trackUri;

        // Get or create our tag info element
        if (!state.nowPlayingWidgetTagInfo) {
          state.nowPlayingWidgetTagInfo = document.createElement("div");
          state.nowPlayingWidgetTagInfo.className = "tagify-playbar-info";
          state.nowPlayingWidgetTagInfo.style.marginLeft = "8px";
          state.nowPlayingWidgetTagInfo.style.fontSize = "11px";
          state.nowPlayingWidgetTagInfo.style.display = "flex";
          state.nowPlayingWidgetTagInfo.style.alignItems = "center";
          state.nowPlayingWidgetTagInfo.style.whiteSpace = "nowrap";

          // Find the track info container and add our element after it
          const trackInfo = await utils.waitForElement(
            ".main-nowPlayingWidget-nowPlaying .main-trackInfo-container"
          );
          trackInfo.after(state.nowPlayingWidgetTagInfo);
        }

        // Make sure our element is visible
        state.nowPlayingWidgetTagInfo.style.display = "flex";

        // Check if track is tagged
        const isTagged = utils.isTrackTagged(trackUri);

        // Check various status flags
        const needsWarning = utils.shouldShowLikedOnlyWarning(trackUri);
        const incomplete = utils.hasIncompleteTags(trackUri);

        // Build the HTML content
        let htmlContent = "";

        if (isTagged) {
          const summary = utils.getTrackTagSummary(trackUri);

          // Use orange bullet for incomplete tags, green for complete tags
          const bulletColor = incomplete ? "#FFA500" : "#1DB954";

          htmlContent += `<span style="color:${bulletColor}; margin-right:4px;">●</span> ${summary} `;
        }

        // Add status indicator
        if (needsWarning) {
          // Warning icon for tracks only in Liked Songs/excluded playlists
          htmlContent += `<span style="color:#ffcc00; margin-left:4px;" title="This track is only in Liked Songs or excluded playlists">⚠️</span>`;
        } else {
          // Get playlist list to check if track is in any regular playlists
          const playlistList = utils.getPlaylistListForTrack(trackUri);

          // Only add green checkmark if track is in at least one regular playlist
          if (playlistList !== "No regular playlists") {
            htmlContent += `<span style="color:#1DB954; margin-left:4px;" title="${playlistList}">✓</span>`;
          }
          // If no regular playlists, don't add any icon
        }

        // Update the content
        state.nowPlayingWidgetTagInfo.innerHTML = htmlContent;

        // Add a click handler to navigate to Tagify
        state.nowPlayingWidgetTagInfo.style.cursor = "pointer";
        state.nowPlayingWidgetTagInfo.onclick = () => {
          Spicetify.Platform.History.push({
            pathname: `/${APP_NAME}`,
            search: `?uri=${encodeURIComponent(trackUri)}`,
            state: { trackUri },
          });
        };
      } catch (error) {
        console.error("Tagify: Error updating Now Playing widget", error);
      }
    },
  };

  // Main initialization
  const initialize = async function () {
    console.log("Tagify: Starting initialization...");

    // Try to load tag data first since it's needed by all features
    if (!utils.loadTaggedTracks()) {
      console.log("Tagify: No tagged tracks found");
    }

    // Initialize features
    menuFeature.initialize();
    indicatorFeature.initialize();
    playbarFeature.initialize();

    console.log("Tagify: Initialization complete");
  };

  // Start initialization
  initialize();
})();
