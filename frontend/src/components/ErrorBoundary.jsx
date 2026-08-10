import { Component } from 'react';
import { withTranslation } from 'react-i18next';
import { AlertTriangle, RotateCcw } from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-6">
          <div className="game-panel p-8 max-w-md w-full text-center">
            {/* Danger icon */}
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-crimson/20 flex items-center justify-center">
                <AlertTriangle size={32} className="text-crimson" />
              </div>
            </div>

            {/* Title */}
            <h2 className="font-heading text-crimson text-xs mb-3">
              {t('errorBoundary.title')}
            </h2>

            {/* Message */}
            <p className="font-body text-cream/80 text-lg mb-2">
              {t('errorBoundary.message')}
            </p>
            <p className="font-body text-cream/50 text-base mb-6">
              {t('errorBoundary.hint')}
            </p>

            {/* Error details (collapsed) */}
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="font-body text-cream/40 text-sm cursor-pointer hover:text-cream/60 transition-colors">
                  {t('errorBoundary.details')}
                </summary>
                <pre className="mt-2 p-3 bg-navy rounded text-crimson/80 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words">
                  {this.state.error.message || t('errorBoundary.unknownError')}
                </pre>
              </details>
            )}

            {/* Retry button */}
            <button
              onClick={this.handleReset}
              className="game-btn game-btn-gold inline-flex items-center gap-2"
            >
              <RotateCcw size={14} />
              {t('errorBoundary.tryAgain')}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
