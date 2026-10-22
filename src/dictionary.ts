import type { Section } from './categories'

const WORDS: Record<Section, string[]> = {
  Produce: [
    'apple', 'banana', 'orange', 'lemon', 'lime', 'grape', 'strawberry', 'blueberry', 'raspberry', 'berry',
    'mango', 'pineapple', 'pear', 'peach', 'plum', 'cherry', 'kiwi', 'melon', 'watermelon', 'avocado',
    'tomato', 'potato', 'onion', 'garlic', 'ginger', 'carrot', 'cucumber', 'lettuce', 'spinach', 'kale',
    'broccoli', 'cauliflower', 'cabbage', 'pepper', 'capsicum', 'chilli', 'chili', 'zucchini', 'eggplant',
    'brinjal', 'mushroom', 'celery', 'corn', 'peas', 'beans', 'coriander', 'cilantro', 'parsley', 'basil',
    'mint', 'herbs', 'salad', 'fruit', 'vegetables', 'veggies', 'okra', 'beetroot', 'radish', 'leek',
    'spring onion', 'sweet potato', 'pumpkin', 'squash', 'asparagus', 'curry leaves',
  ],
  Bakery: ['bread', 'loaf', 'bagel', 'croissant', 'bun', 'roll', 'baguette', 'muffin', 'tortilla', 'pita', 'naan', 'cake', 'sourdough', 'brioche', 'pastry'],
  'Meat & fish': [
    'chicken', 'beef', 'pork', 'lamb', 'mutton', 'mince', 'steak', 'bacon', 'ham', 'sausage', 'turkey',
    'fish', 'salmon', 'tuna', 'prawn', 'prawns', 'shrimp', 'cod', 'crab', 'meat',
  ],
  'Dairy & eggs': [
    'milk', 'egg', 'eggs', 'butter', 'cheese', 'yogurt', 'yoghurt', 'curd', 'cream', 'paneer', 'ghee',
    'cream cheese', 'sour cream', 'mozzarella', 'cheddar', 'parmesan', 'oat milk', 'almond milk',
  ],
  Frozen: ['ice cream', 'frozen', 'frozen peas', 'pizza', 'ice', 'fries', 'popsicle'],
  Pantry: [
    'rice', 'pasta', 'noodles', 'flour', 'atta', 'sugar', 'salt', 'oil', 'olive oil', 'vinegar', 'cereal',
    'oats', 'honey', 'jam', 'peanut butter', 'sauce', 'ketchup', 'mayo', 'mustard', 'spices', 'cumin',
    'turmeric', 'masala', 'lentils', 'dal', 'chickpeas', 'quinoa', 'soup', 'stock', 'yeast', 'baking soda',
    'coffee', 'tea', 'cocoa', 'nuts', 'almonds', 'cashews', 'raisins', 'canned', 'tinned', 'soy sauce',
  ],
  'Snacks & drinks': [
    'chips', 'crisps', 'biscuits', 'cookies', 'crackers', 'chocolate', 'candy', 'popcorn', 'snacks',
    'juice', 'soda', 'coke', 'water', 'sparkling water', 'beer', 'wine', 'kombucha',
  ],
  Household: [
    'detergent', 'dish soap', 'dishwasher tablets', 'sponge', 'bin bags', 'trash bags', 'garbage bags',
    'toilet paper', 'tissues', 'paper towels', 'foil', 'cling film', 'batteries', 'light bulb', 'bulb',
    'bleach', 'cleaner', 'softener', 'napkins',
  ],
  'Personal care': [
    'shampoo', 'conditioner', 'soap', 'body wash', 'toothpaste', 'toothbrush', 'floss', 'deodorant',
    'razor', 'lotion', 'sunscreen', 'face wash', 'moisturiser', 'moisturizer', 'cotton', 'pads', 'tampons',
    'medicine', 'vitamins', 'plasters', 'band-aids',
  ],
  Other: [],
}

/** Word or phrase → section. Phrases (with spaces) are matched before single words. */
export const DICTIONARY: Map<string, Section> = new Map(
  Object.entries(WORDS).flatMap(([section, words]) => words.map((w) => [w, section as Section] as const)),
)

/** A sentence starting with one of these is a to-do. */
export const TODO_VERBS = new Set([
  'call', 'pay', 'book', 'email', 'text', 'message', 'schedule', 'renew', 'fix', 'clean', 'send', 'return',
  'cancel', 'write', 'finish', 'submit', 'file', 'reply', 'ask', 'check', 'visit', 'meet', 'plan', 'review',
  'read', 'watch', 'wash', 'repair', 'order', 'apply', 'post', 'mail', 'print', 'sign', 'update', 'remind',
  'prepare', 'pack', 'drop', 'collect', 'take', 'make', 'learn', 'study', 'organize', 'organise', 'sort',
  'water', 'feed', 'walk', 'go', 'see', 'tell', 'follow', 'register', 'transfer', 'refill', 'charge',
])
