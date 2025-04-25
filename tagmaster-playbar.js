// tagmaster-playbar.js

(function TagMasterPlaybar() {
  // Wait for Spicetify to be ready
  if (!Spicetify?.Platform) {
    setTimeout(TagMasterPlaybar, 300);
    return;
  }

  console.log("TagMaster: Playbar extension loading...");

  const STORAGE_KEY = "tagmaster:tagData";
  const PLAYLIST_CACHE_KEY = "tagmaster:playlistCache";
  const SETTINGS_KEY = "tagmaster:playlistSettings";
  let taggedTracks = {};
  let nowPlayingWidgetTagInfo = null;
  let lastTrackUri = null;

  // Load tagged tracks from localStorage
  function loadTaggedTracks() {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const data = JSON.parse(savedData);
        if (data && data.tracks) {
          taggedTracks = data.tracks;
          console.log(
            `TagMaster Playbar: Loaded ${Object.keys(taggedTracks).length} tagged tracks`
          );
          return true;
        }
      }
    } catch (error) {
      console.error("TagMaster Playbar: Error loading data", error);
    }
    return false;
  }

  // Check if a track is tagged
  function isTrackTagged(trackUri) {
    return trackUri in taggedTracks;
  }

  // Get playlist cache
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

  // Get playlist settings
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

  // Check if a playlist is excluded
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

  // Check if a track should show the warning for being only in Liked Songs or excluded playlists
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

  // Get playlist list for a track
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

  // Check if a track has incomplete tags
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

  // Wait for an element to appear in the DOM
  const waitForElement = async (selector) => {
    while (!document.querySelector(selector)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return document.querySelector(selector);
  };

  // Function to update the Now Playing widget
  async function updateNowPlayingWidget() {
    try {
      // Get the current track URI
      const trackUri = Spicetify.Player.data?.item?.uri;
      if (!trackUri || !trackUri.includes("track")) {
        if (nowPlayingWidgetTagInfo) {
          nowPlayingWidgetTagInfo.style.display = "none";
        }
        return;
      }

      // Skip if URI hasn't changed and element exists
      if (trackUri === lastTrackUri && nowPlayingWidgetTagInfo) return;
      lastTrackUri = trackUri;

      // Get or create our tag info element
      if (!nowPlayingWidgetTagInfo) {
        nowPlayingWidgetTagInfo = document.createElement("div");
        nowPlayingWidgetTagInfo.className = "tagmaster-playbar-info";
        nowPlayingWidgetTagInfo.style.marginLeft = "8px";
        nowPlayingWidgetTagInfo.style.fontSize = "11px";
        nowPlayingWidgetTagInfo.style.display = "flex";
        nowPlayingWidgetTagInfo.style.alignItems = "center";
        nowPlayingWidgetTagInfo.style.whiteSpace = "nowrap";

        // Find the track info container and add our element after it
        const trackInfo = await waitForElement(
          ".main-nowPlayingWidget-nowPlaying .main-trackInfo-container"
        );
        trackInfo.after(nowPlayingWidgetTagInfo);
      }

      // Make sure our element is visible
      nowPlayingWidgetTagInfo.style.display = "flex";

      // Check if track is tagged
      const isTagged = isTrackTagged(trackUri);

      // Check various status flags
      const needsWarning = shouldShowLikedOnlyWarning(trackUri);
      const incomplete = hasIncompleteTags(trackUri);

      // Build the HTML content
      let htmlContent = "";

      if (isTagged) {
        const summary = getTrackTagSummary(trackUri);

        // Use orange bullet for incomplete tags, green for complete tags
        const bulletColor = incomplete ? "#FFA500" : "#1DB954";

        htmlContent += `<span style="color:${bulletColor}; margin-right:4px;">●</span> ${summary} `;
      }

      // Add status indicator
      if (needsWarning) {
        // Warning icon for tracks only in Liked Songs/excluded playlists
        htmlContent += `<span style="color:#ffcc00; margin-left:4px;" title="This track is only in Liked Songs or excluded playlists">⚠️</span>`;
      } else {
        // Green checkmark for tracks in regular playlists
        const playlistList = getPlaylistListForTrack(trackUri);
        htmlContent += `<span style="color:#1DB954; margin-left:4px;" title="In playlists: ${playlistList}">✓</span>`;
      }

      // Update the content
      nowPlayingWidgetTagInfo.innerHTML = htmlContent;

      // Add a click handler to navigate to TagMaster
      nowPlayingWidgetTagInfo.style.cursor = "pointer";
      nowPlayingWidgetTagInfo.onclick = () => {
        Spicetify.Platform.History.push({
          pathname: "/tag-master",
          search: `?uri=${encodeURIComponent(trackUri)}`,
          state: { trackUri },
        });
      };
    } catch (error) {
      console.error("TagMaster Playbar: Error updating Now Playing widget", error);
    }
  }

  // Initialize the extension
  async function initialize() {
    if (loadTaggedTracks()) {
      // Wait for Player to be ready
      while (!Spicetify.Player || !Spicetify.Player.data) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Add listener for song changes
      Spicetify.Player.addEventListener("songchange", updateNowPlayingWidget);

      // Initial update
      setTimeout(updateNowPlayingWidget, 1000);

      // Create a MutationObserver to watch for DOM changes
      const observer = new MutationObserver(() => {
        // Check if Now Playing widget might have been recreated
        if (!document.contains(nowPlayingWidgetTagInfo)) {
          nowPlayingWidgetTagInfo = null;
          updateNowPlayingWidget();
        }
      });

      // Start observing the body
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      console.log("TagMaster: Playbar extension initialized successfully");
    } else {
      console.log("TagMaster: No tagged tracks found for playbar extension");
    }
  }

  // Start the extension
  initialize();
})();
