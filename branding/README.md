# KitaKo branding

The supplied SVGs are preserved exactly in `source/`. Production derivatives remove the background rectangle and surplus canvas space. The original yellow wordmark is used on navy; a navy-wordmark variant is used on white. The K symbol and its yellow tile retain their supplied geometry and colors.

- `dashboard/public/branding/`: transparent icon and wordmark SVGs, plus an Apple touch icon.
- `mobile/assets/branding/`: transparent PNG exports for React Native, an opaque 1024px app icon, and a padded transparent Android adaptive icon.
- Palette: navy `#082744`, yellow `#FFDE59`, white backgrounds.

The display name is KitaKo. Existing Expo slug, native application identifiers, Firebase project configuration, and stored photo prefixes are retained for identity/data compatibility. They are implementation identifiers rather than display branding. Native launcher icons and splash screens apply to a native build; Expo Go may show its own launch screen.
