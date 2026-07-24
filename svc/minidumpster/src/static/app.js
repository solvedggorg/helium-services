// deno-lint-ignore-file

document.addEventListener('submit', (event) => {
    const message = event.target.dataset.confirm;
    if (message && !globalThis.confirm(message)) {
        event.preventDefault();
    }
});

document.addEventListener('click', (event) => {
    const target = event.target.closest('.expandable');
    if (!target) {
        return;
    }
    const full = target.dataset.full;
    target.dataset.full = target.textContent;
    target.textContent = full;
});
