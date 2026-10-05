(() => {
  "use strict";

  const bagLabels = Object.freeze({
    sound: "The Sound",
    ledge: "The Ledge",
    undertow: "The Undertow",
    passage: "The Passage — backpack",
    none: "Not requested"
  });
  const materialLabels = Object.freeze({
    crochet: "Crochet study",
    leather: "Leather study",
    undecided: "Still deciding"
  });
  const shirtLabels = Object.freeze({
    none: "Not requested",
    "smell-expensive": "You Smell Expensive.",
    "oxblood-panel": "Oxblood Panel",
    domino: "Good Company. Bad Loser.",
    ironshore: "Ironshore Social Club",
    invitation: "Open Invitation",
    bite: "Bite Me"
  });
  const sizes = Object.freeze(["undecided", "XS", "S", "M", "L", "XL", "XXL"]);
  const quantities = Object.freeze(["1", "2", "3", "4", "5", "6"]);
  const controls = {
    bag: document.getElementById("bag"),
    material: document.getElementById("material"),
    quantity: document.getElementById("quantity"),
    shirt: document.getElementById("shirt"),
    shirtQuantity: document.getElementById("shirt-quantity"),
    size: document.getElementById("size")
  };
  const requestLink = document.getElementById("request-link");
  const draftPreview = document.getElementById("request-draft");
  const sizeHelp = document.getElementById("size-help");

  if (!requestLink || !draftPreview || Object.values(controls).some((control) => !control)) return;

  const allowed = (dictionary, value, fallback) =>
    Object.prototype.hasOwnProperty.call(dictionary, value) ? value : fallback;

  function updateDraft() {
    const bag = allowed(bagLabels, controls.bag.value, "sound");
    const material = bag === "passage" ? "leather" : allowed(materialLabels, controls.material.value, "undecided");
    const shirt = allowed(shirtLabels, controls.shirt.value, "none");
    const quantity = quantities.includes(controls.quantity.value) ? controls.quantity.value : "1";
    const size = sizes.includes(controls.size.value) ? controls.size.value : "undecided";
    const shirtQuantity = quantities.includes(controls.shirtQuantity.value) ? controls.shirtQuantity.value : "1";
    const hasBag = bag !== "none";
    const hasShirt = shirt !== "none";

    if (bag === "passage") controls.material.value = "leather";
    controls.material.disabled = !hasBag || bag === "passage";
    controls.quantity.disabled = !hasBag;
    controls.size.disabled = !hasShirt;
    controls.shirtQuantity.disabled = !hasShirt;
    controls.material.setAttribute("aria-disabled", String(controls.material.disabled));
    controls.quantity.setAttribute("aria-disabled", String(!hasBag));
    controls.size.setAttribute("aria-disabled", String(!hasShirt));
    if (sizeHelp) {
      sizeHelp.textContent = hasShirt
        ? "The house confirms your size before making the shirt."
        : "Choose a shirt to add a size preference.";
    }

    const body = [
      "Hello Cayman Rituals,",
      "",
      "I would like to request the following pieces from the Hand Collection.",
      "",
      "Bag: " + bagLabels[bag],
      "Material interest: " + (hasBag ? materialLabels[material] : "Not applicable"),
      "Bag quantity: " + (hasBag ? quantity : "Not applicable"),
      "Shirt style: " + shirtLabels[shirt],
      "Shirt quantity: " + (hasShirt ? shirtQuantity : "Not applicable"),
      "Shirt unit price: " + (hasShirt ? "CI$75" : "Not applicable"),
      "Shirt making time: " + (hasShirt ? "2–3 days after order confirmation" : "Not applicable"),
      "Shirt size preference: " + (hasShirt ? (size === "undecided" ? "Still deciding" : size) : "Not selected"),
      "",
      "Please confirm shirt sizing, payment and collection details. For bags, please confirm final construction, pricing and delivery after samples.",
      ""
    ].join("\r\n");

    requestLink.href = "mailto:caymanrituals@gmail.com?subject=" +
      encodeURIComponent("Hand Collection — shirt order / bag enquiry") +
      "&body=" + encodeURIComponent(body);
    draftPreview.value = body;
  }

  Object.values(controls).forEach((control) => {
    control.addEventListener("change", updateDraft);
  });

  document.querySelectorAll("[data-bag]").forEach((link) => {
    link.addEventListener("click", () => {
      const bag = link.getAttribute("data-bag");
      const material = link.getAttribute("data-material");
      const shirt = link.getAttribute("data-shirt");

      if (Object.prototype.hasOwnProperty.call(bagLabels, bag)) controls.bag.value = bag;
      if (Object.prototype.hasOwnProperty.call(materialLabels, material)) controls.material.value = material;
      if (Object.prototype.hasOwnProperty.call(shirtLabels, shirt)) controls.shirt.value = shirt;
      updateDraft();
    });
  });

  updateDraft();
})();

