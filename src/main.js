import '../style.css'
import { Editor } from './editor.js'

document.addEventListener('DOMContentLoaded', () => {
  const editor = new Editor();
  editor.init();
  editor.checkLocalMode();
});
