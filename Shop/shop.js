// 1. Array to hold all placed orders
let allOrders = [];

// 2. Cart variables
let totalItems = 0;
let totalPrice = 0;


const cartText = document.getElementById('cart-summary-text');
const checkoutBtn = document.getElementById('checkout-btn');
const productCards = document.querySelectorAll('.product-card');

// 4. Set up each product card with simple + and - buttons
productCards.forEach(card => {
    const addBtn = card.querySelector('.add-to-cart');
    const priceText = card.querySelector('.product-price').textContent;
    const price = parseInt(priceText.replace('₹', ''));
    const plantName = card.querySelector('h3').textContent;

    let count = 0;

    // Create quantity controls [ - ] [ 0 ] [ + ]
    const qtyBox = document.createElement('div');
    qtyBox.className = 'qty-control hidden';
    qtyBox.innerHTML = `
        <button class="qty-btn" type="button">−</button>
        <span class="qty-count">0</span>
        <button class="qty-btn" type="button">+</button>
    `;
    addBtn.after(qtyBox);

    const minusBtn = qtyBox.children[0];
    const countSpan = qtyBox.children[1];
    const plusBtn = qtyBox.children[2];

    // Function when quantity increases
    function increase() {
        count++;
        totalItems++;
        totalPrice += price;
        updateUI();
    }

    // Function when quantity decreases
    function decrease() {
        if (count > 0) {
            count--;
            totalItems--;
            totalPrice -= price;
            updateUI();
        }
    }

    // Update this card's buttons and the bottom summary bar
    function updateUI() {
        countSpan.textContent = count;

        if (count > 0) {
            addBtn.style.display = 'none';
            qtyBox.classList.remove('hidden');
        } else {
            addBtn.style.display = 'block';
            qtyBox.classList.add('hidden');
        }

        // Update bottom bar
        cartText.textContent = `${totalItems} items — Total: ₹${totalPrice}`;
        checkoutBtn.disabled = (totalItems === 0);
    }

    // Attach click events
    addBtn.onclick = increase;
    plusBtn.onclick = increase;
    minusBtn.onclick = decrease;

    // Store card's reset function and data so checkout can read/clear it
    card.resetCard = function () {
        count = 0;
        updateUI();
    };

    card.getOrderData = function () {
        if (count > 0) {
            return { plant: plantName, quantity: count, price: price };
        }
        return null;
    };
});

// 5. Checkout: save order and download updated orders.json
checkoutBtn.onclick = function () {
    if (totalItems === 0) return;

    // Collect items from cards
    let currentItems = [];
    productCards.forEach(card => {
        let item = card.getOrderData();
        if (item) currentItems.push(item);
    });

    // Create new order object
    let newOrder = {
        orderId: Date.now(),
        items: currentItems,
        totalItems: totalItems,
        totalAmount: totalPrice
    };

    // Add new order to previous orders list
    allOrders.push(newOrder);

    // Download the updated orders.json file
    let jsonString = JSON.stringify(allOrders, null, 2);
    let blob = new Blob([jsonString], { type: "application/json" });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "orders.json";
    link.click();

    // Reset everything back to zero
    totalItems = 0;
    totalPrice = 0;
    cartText.textContent = "0 items — Total: ₹0";
    checkoutBtn.disabled = true;

    productCards.forEach(card => card.resetCard());

    alert("Order placed! orders.json downloaded.");
};
