import ReactDOM from 'react-dom/client';
import App from './App';
import Staff from './Staff';

const root = ReactDOM.createRoot(document.getElementById('root')!);
const isStaff = window.location.pathname.startsWith('/staff');

root.render(isStaff ? <Staff /> : <App />);
