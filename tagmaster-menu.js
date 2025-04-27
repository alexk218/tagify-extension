(function tagMasterMenu() {
  if (!(Spicetify.CosmosAsync && Spicetify.Platform && Spicetify.ContextMenu)) {
    setTimeout(tagMasterMenu, 300);
    return;
  }

  const APP_NAME = "tag-master";

  function shouldShowTagMenu(uris) {
    return uris.some((uri) => uri.startsWith("spotify:track:") || uri.startsWith("spotify:local:"));
  }

  function handleTagMenuClick(uris) {
    if (uris.length > 0) {
      const trackUris = uris.filter(
        (uri) => uri.startsWith("spotify:track:") || uri.startsWith("spotify:local:")
      );

      // For multiple tracks, encode the URIs array
      if (trackUris.length > 1) {
        const encodedUris = encodeURIComponent(JSON.stringify(trackUris));

        Spicetify.Platform.History.push({
          pathname: `/${APP_NAME}`,
          search: `?uris=${encodedUris}`,
          state: { trackUris },
        });
      } else if (trackUris.length === 1) {
        // Single track case
        const trackUri = trackUris[0];
        Spicetify.Platform.History.push({
          pathname: `/${APP_NAME}`,
          search: `?uri=${encodeURIComponent(trackUri)}`,
          state: { trackUri },
        });
      }
    }
  }

  new Spicetify.ContextMenu.Item(
    "Tag with TagMaster",
    handleTagMenuClick,
    shouldShowTagMenu,
    `<svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.19 1A4.82 4.82 0 0 0 2.67 3a4.82 4.82 0 0 0 0 4.37 4.83 4.83 0 0 0 4.37 2.76 2.41 2.41 0 0 0 1.81-.73l4.68-5.05a2.4 2.4 0 0 0 0-3.22 2.4 2.4 0 0 0-3.22 0L5.26 6.18a.6.6 0 1 0 .87.81l5.05-5.05a1.2 1.2 0 0 1 1.61 0 1.2 1.2 0 0 1 0 1.61l-4.68 5.05a1.2 1.2 0 0 1-.9.37 3.62 3.62 0 0 1-3.27-2.07 3.62 3.62 0 0 1 0-3.28A3.63 3.63 0 0 1 7.19 2.2a.6.6 0 0 0 0-1.2z"></path><path d="M13.32 8.1a.6.6 0 0 0-.6.61v1.21a.6.6 0 0 0 .6.61.61.61 0 0 0 .61-.61V8.71a.61.61 0 0 0-.61-.61z"></path><path d="M11.5 8.1a.6.6 0 0 0-.6.61v3.03a.6.6 0 0 0 .6.61.61.61 0 0 0 .61-.61V8.71a.61.61 0 0 0-.61-.61z"></path><path d="M9.69 8.1a.6.6 0 0 0-.61.61v3.03a.6.6 0 0 0 .61.61.6.6 0 0 0 .6-.61V8.71a.6.6 0 0 0-.6-.61z"></path><path d="M7.87 10.52a.6.6 0 0 0-.6.61v1.21a.6.6 0 0 0 .6.61.61.61 0 0 0 .61-.61v-1.21a.61.61 0 0 0-.61-.61z"></path></svg>`
  ).register();
})();
