import '@testing-library/jest-dom';

// jsdom polyfill for components using scrollIntoView
Element.prototype.scrollIntoView = () => {};
