// Compatibility wrapper.
// App.tsx belongs in src/App.tsx. This file exists only to prevent build failures
// if an older/manual upload accidentally placed or referenced App inside src/components.
export { default } from '../App';
