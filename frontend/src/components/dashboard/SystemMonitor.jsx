import { Server, Camera, Layers, ScanFace, PersonStanding, Shirt } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StatusChip } from '../common/UI';
export default function SystemMonitor() {
  const { online } = useApp();
  return (
    <section className="panel system-monitor">
      <div className="panel-heading">
        <h3>Technology status</h3>
        <p>What’s available now, and what comes next.</p>
      </div>
      <div className="monitor-grid">
        {[
          {
            icon: Server,
            name: 'Spring Boot API',
            status: online === null ? 'Checking' : online ? 'Online' : 'Offline',
          },
          {
            icon: Camera,
            name: 'Camera API',
            status: navigator.mediaDevices?.getUserMedia ? 'Browser supported' : 'Unavailable',
          },
          { icon: Layers, name: 'Canvas renderer', status: 'Manual prototype' },
          { icon: ScanFace, name: 'Face AR engine', status: 'Future' },
          { icon: PersonStanding, name: 'Pose AR engine', status: 'Future' },
          { icon: Shirt, name: 'AI clothing engine', status: 'Future' },
        ].map((item) => (
          <div key={item.name}>
            <item.icon size={20} />
            <span>{item.name}</span>
            <StatusChip status={item.status} />
          </div>
        ))}
      </div>
    </section>
  );
}
