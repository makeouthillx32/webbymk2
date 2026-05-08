import { type ReactNode, type Ref } from 'react';
import { type DOMElement } from './dom.js';
import { type Styles, type TextStyles } from './styles.js';
import { type EventHandlerProps } from './events/event-handlers.js';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'ink-root': InkElementProps & {
        focusManager?: any;
      };
      'ink-box': InkElementProps & {
        tabIndex?: number;
        autoFocus?: boolean;
      };
      'ink-text': InkElementProps & {
        textStyles?: TextStyles;
      };
      'ink-virtual-text': {
        children?: ReactNode;
        textStyles?: TextStyles;
      };
      'ink-link': {
        children?: ReactNode;
        url?: string;
        textStyles?: TextStyles;
      };
      'ink-progress': InkElementProps & {
        value?: number;
      };
      'ink-raw-ansi': InkElementProps & {
        value?: string;
      };
    }

    interface InkElementProps extends EventHandlerProps {
      children?: ReactNode;
      ref?: Ref<DOMElement>;
      style?: Styles;
    }
  }
}

export {};