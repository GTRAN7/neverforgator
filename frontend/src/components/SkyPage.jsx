import Sky from '../palace/components/Sky.jsx';
import { useDisplay } from '../lib/display.js';

// Campus mode's sky (clouds, sun or moon, hills, the castle) behind a whole page.
// It follows night mode: stars, a moon and bats at night.
export default function SkyPage({ castle = false, children }) {
  const [{ night }] = useDisplay();
  return (
    <div className="sky-page">
      <Sky night={night} castle={castle} />
      {children}
    </div>
  );
}
