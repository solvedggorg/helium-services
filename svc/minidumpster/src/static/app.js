// deno-lint-ignore-file

document.addEventListener('click', (event) => {
    const target = event.target.closest('.expandable');
    if (!target) {
        return;
    }
    const full = target.dataset.full;
    target.dataset.full = target.textContent;
    target.textContent = full;
});
