import { Component } from 'react';
import { Gator } from './Logo.jsx';

// If a screen crashes, show a friendly way out instead of a blank page.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Screen crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center crash">
        <Gator size={96} />
        <h1 className="card-title huge">Oops, the gator tripped.</h1>
        <p className="scrawl">{this.state.error.message}</p>
        <button className="btn accent" onClick={() => { window.location.hash = '#/'; window.location.reload(); }}>
          Back to my palaces
        </button>
      </div>
    );
  }
}
