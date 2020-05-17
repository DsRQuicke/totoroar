class ActionStateManager {
	/**	Constructs an ActionStateManager.
	 */
	constructor() {
		// Initialy start in the "undefined" state.
		this.clearAll();
	}

	/**	Adds the provided state.
	 *
	 *	@param {string} stateName - The name of the state to add.
	 *	@param {function} [switchInFn=null] - The function to call when
	 *	switching to this state. It will be provided with two
	 *	parameters, respectively the old and new state names.
	 *	@param {function} [switchOutFn=null] - The function to call when
	 *	switching from this state to another. It will be provided with
	 *	two parameters, respectively the old and new state names.
	 */
	addState(stateName, switchInFn=null, switchOutFn=null) {
		this.states[stateName] = {
			"switchInFn": switchInFn,
			"switchOutFn": switchOutFn
		};
	}

	/**	Removes the provided state.
	 *
	 *	@param {string} stateName - The name of the state to remove.
	 */
	removeState(stateName) {
		delete this.states[stateName];
	}

	/**	Switches to the provided state.
	 *
	 *	This will try to switch to the provided state (if it exists). It
	 *	will then first call the "switchOutFn" function of the current
	 *	state, and then call the "switchInFn" function of the new state.
	 *	Both functions will be provided with the old and new state
	 *	names (in that order).
	 *
	 *	@param {string} stateName - The name of the state to switch to.
	 *	@returns <code>false</code> if the state couldn't be found;
	 *	<code>true</code> otherwise.
	 */
	switchState(stateName) {
		const newState = this.states[stateName];
		if ( !newState ) {
			return false;
		}
		console.debug(`Switching to ${stateName} from ${this.currentStateName}`);
		const oldState = this.states[this.currentStateName];
		const oldStateName = this.currentStateName;
		// Note that the old state might have been removed, or it might
		// have no "switchOutFn". Note also that the UNDEFINED_STATE
		// has no "switchOutFn".
		if ( oldState && typeof oldState.switchOutFn === "function" ) {
			oldState.switchOutFn(oldStateName, stateName);
		}
		// Update the current state variable to the new state (before
		// calling its "switchInFn" function.
		this.currentStateName = stateName;
		if ( typeof newState.switchInFn === "function" ) {
			newState.switchInFn(oldStateName, stateName);
		}

		return true;
	}

	/**	Switches to the first provided state if it's not active,
	 *	otherwise it will swap to the second state.
	 *
	 *	@param {string} toStateName - The name of the state to switch
	 *	if it's not already active.
	 *	@param {string} defaultStateName - The name of the state to
	 *	switch to if the <code>toStateName</code> was currently the
	 *	active state.
	 *	@returns <code>false</code> if the state that is being switch
	 *	to couldn't be found; <code>true</code> otherwise.
	 */
	toggleState(toStateName, defaultState) {
		if ( this.currentStateName != toStateName ) {
			return this.switchState(toStateName);
		} else {
			return this.switchState(defaultState);
		}
	}

	/**	Returns the current state.
	 *	@returns The current state.
	 */
	getState() {
		return this.currentStateName;
	}

	clearAll() {
		this.states = {};
		// Initialy start in the "undefined" state.
		this.currentStateName = ActionStateManager.UNDEFINED_STATE;
	}

	/**	Sets the state back to UNDEFINED_STATE without calling the
	 *	switchOutFn of the current callback.
	 */
	reset() {
		this.currentStateName = ActionStateManager.UNDEFINED_STATE;
	}
}

ActionStateManager.UNDEFINED_STATE = "undefined_state";

