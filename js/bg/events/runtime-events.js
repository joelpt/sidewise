///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

function registerRuntimeEvents()
{
    chrome.runtime.onSuspend.addListener(onRuntimeSuspend);
    chrome.runtime.onSuspendCanceled.addListener(onRuntimeSuspendCanceled);
}


///////////////////////////////////////////////////////////
// Event handlers
///////////////////////////////////////////////////////////

// Called when Chrome is about to exit; prohibit saving any changes to the
// tree or updating the sidebar during this time
function onRuntimeSuspend() {
    shutdownSidewise();
}


// Called when Chrome "cancels" an exit; for this we just restart Sidewise entirely
// to avoid issues with the existing pre-restart state messing with post-restart state
function onRuntimeSuspendCanceled() {
    restartSidewise();
}


