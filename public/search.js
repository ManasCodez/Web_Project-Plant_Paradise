const searchInput = document.getElementById('plantSearch');
const searchResult = document.getElementById('searchResult');
function searchPlants() {
  const term = searchInput.value.toLowerCase().trim();
  let count = 0;
  document.querySelectorAll('.plant-card').forEach(card => {
    const matches = card.querySelector('h3').textContent.toLowerCase().includes(term);
    card.style.display = matches ? '' : 'none';
    if (matches) count++;
  });
  document.querySelectorAll('.plant-section').forEach(section => {
    section.style.display = [...section.querySelectorAll('.plant-card')].some(card => card.style.display !== 'none') || !term ? '' : 'none';
  });
  searchResult.textContent = !term ? '' : count ? `🌱 Found ${count} matching plant(s)` : '❌ No plants found! Try another name.';
}
searchInput.addEventListener('input', searchPlants);
document.getElementById('clearSearch').addEventListener('click', () => { searchInput.value = ''; searchPlants(); searchInput.focus(); });
document.addEventListener('content:loaded', searchPlants);
