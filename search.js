// ==============================
// PLANT PARADISE LIVE SEARCH
// ==============================

// Access HTML elements
const searchInput = document.getElementById("plantSearch");

const plantCards = document.querySelectorAll(".plant-card");

const plantSections = document.querySelectorAll(".plant-section");

const searchResult = document.getElementById("searchResult");

const clearButton = document.getElementById("clearSearch");


// Search function
function searchPlants() {

    // Get user input and convert to lowercase
    const searchText = searchInput.value.toLowerCase().trim();

    let visibleCount = 0;

    // Loop through each plant card
    plantCards.forEach(function(card) {

        // Get plant name
        const plantName = card.querySelector("h3").textContent.toLowerCase();

        // Compare with search text
        if (plantName.includes(searchText)) {

            card.style.display = "";
            visibleCount++;

        } else {

            card.style.display = "none";

        }

    });


    // Hide sections that have no matching plants
    plantSections.forEach(function(section) {

        const cards = section.querySelectorAll(".plant-card");

        let hasVisiblePlants = false;

        cards.forEach(function(card) {

            if (card.style.display !== "none") {
                hasVisiblePlants = true;
            }

        });

        section.style.display = hasVisiblePlants ? "" : "none";

    });


    // Display search result message
    if (searchText === "") {

        searchResult.textContent = "";

    } else if (visibleCount === 0) {

        searchResult.textContent = "❌ No plants found! Try another name.";

    } else {

        searchResult.textContent = `🌱 Found ${visibleCount} matching plant(s)`;

    }

}


// Run search whenever the user types
searchInput.addEventListener("input", searchPlants);


// Clear search functionality
clearButton.addEventListener("click", function() {

    searchInput.value = "";

    searchPlants();

    searchInput.focus();

});