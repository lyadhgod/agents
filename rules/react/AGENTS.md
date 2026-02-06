# Agent guidelines

- If a react component to be worked on is a functional component:
    - All React components must use useReducer hook for state management and not useState.
    - For useReducer hook, the initial state must be a const at the root of the file and not inside the component.
    - Any constant or function that will perform correctly outside a React component must be declared outside a React component.
