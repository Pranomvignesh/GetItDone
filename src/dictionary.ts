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
    'grapes', 'pomegranate', 'papaya', 'guava', 'apricot', 'fig', 'dates', 'coconut', 'green beans', 'green chillies', 'drumstick', 'bottle gourd', 'bitter gourd', 'ridge gourd', 'methi', 'fenugreek', 'arugula', 'rocket', 'scallions', 'shallots', 'jalapeno', 'bell pepper', 'microgreens', 'sprouts', 'turnip', 'yam', 'taro', 'raw banana', 'plantain', 'lemongrass', 'dill', 'rosemary', 'thyme', 'oregano',
  ],
  Bakery: ['bread', 'loaf', 'bagel', 'croissant', 'bun', 'roll', 'baguette', 'muffin', 'tortilla', 'pita', 'naan', 'cake', 'sourdough', 'brioche', 'pastry',
    'pav', 'buns', 'rolls', 'english muffin', 'crumpets', 'focaccia', 'ciabatta', 'rye bread', 'wraps', 'cookies dough', 'donut', 'doughnut', 'pie',
  ],
  'Meat & fish': [
    'chicken', 'beef', 'pork', 'lamb', 'mutton', 'mince', 'steak', 'bacon', 'ham', 'sausage', 'turkey',
    'fish', 'salmon', 'tuna', 'prawn', 'prawns', 'shrimp', 'cod', 'crab', 'meat',
    'keema', 'chicken breast', 'drumsticks', 'wings', 'pork chops', 'ribs', 'salami', 'pepperoni', 'chorizo', 'anchovies', 'sardines', 'mackerel', 'pomfret', 'squid', 'mussels', 'lobster', 'tilapia', 'seafood',
  ],
  'Dairy & eggs': [
    'milk', 'egg', 'eggs', 'butter', 'cheese', 'yogurt', 'yoghurt', 'curd', 'cream', 'paneer', 'ghee',
    'cream cheese', 'sour cream', 'mozzarella', 'cheddar', 'parmesan', 'oat milk', 'almond milk',
    'buttermilk', 'kefir', 'greek yogurt', 'whipping cream', 'heavy cream', 'half and half', 'feta', 'ricotta', 'brie', 'gouda', 'halloumi', 'cottage cheese', 'soy milk', 'coconut milk', 'margarine', 'khoa', 'lassi',
  ],
  Frozen: ['ice cream', 'frozen', 'frozen peas', 'pizza', 'ice', 'fries', 'popsicle',
    'frozen vegetables', 'frozen berries', 'ice cubes', 'gelato', 'sorbet', 'frozen paratha', 'nuggets', 'fish fingers', 'hash browns',
  ],
  Pantry: [
    'rice', 'pasta', 'noodles', 'flour', 'atta', 'sugar', 'salt', 'oil', 'olive oil', 'vinegar', 'cereal',
    'oats', 'honey', 'jam', 'peanut butter', 'sauce', 'ketchup', 'mayo', 'mustard', 'spices', 'cumin',
    'turmeric', 'masala', 'lentils', 'dal', 'chickpeas', 'quinoa', 'soup', 'stock', 'yeast', 'baking soda',
    'coffee', 'tea', 'cocoa', 'nuts', 'almonds', 'cashews', 'raisins', 'canned', 'tinned', 'soy sauce',
    'besan', 'rava', 'sooji', 'semolina', 'poha', 'maida', 'jaggery', 'tamarind', 'hing', 'asafoetida', 'jeera', 'mustard seeds', 'cardamom', 'cloves', 'cinnamon', 'bay leaves', 'chilli powder', 'garam masala', 'sambar powder', 'rasam powder', 'pickle', 'papad', 'vermicelli', 'basmati', 'brown rice', 'toor dal', 'moong dal', 'urad dal', 'chana', 'rajma', 'kidney beans', 'black beans', 'baked beans', 'tomato paste', 'passata', 'pesto', 'salsa', 'hummus', 'tahini', 'maple syrup', 'cornflakes', 'muesli', 'granola', 'breadcrumbs', 'cornstarch', 'baking powder', 'vanilla', 'chocolate chips', 'idli batter', 'dosa batter', 'instant noodles', 'maggi',
  ],
  'Snacks & drinks': [
    'chips', 'crisps', 'biscuits', 'cookies', 'crackers', 'chocolate', 'candy', 'popcorn', 'snacks',
    'juice', 'soda', 'coke', 'water', 'sparkling water', 'beer', 'wine', 'kombucha',
    'namkeen', 'bhujia', 'chakli', 'peanuts', 'trail mix', 'granola bars', 'protein bars', 'pretzels', 'nachos', 'gum', 'mints', 'lemonade', 'iced tea', 'energy drink', 'tonic', 'club soda', 'coconut water', 'cola', 'pepsi', 'sprite', 'whisky', 'vodka', 'rum', 'gin',
  ],
  Household: [
    'detergent', 'dish soap', 'dishwasher tablets', 'sponge', 'bin bags', 'trash bags', 'garbage bags',
    'toilet paper', 'tissues', 'paper towels', 'foil', 'cling film', 'batteries', 'light bulb', 'bulb',
    'bleach', 'cleaner', 'softener', 'napkins',
    'dish liquid', 'dishwashing liquid', 'laundry detergent', 'fabric softener', 'surface cleaner', 'glass cleaner', 'floor cleaner', 'toilet cleaner', 'scrub', 'steel wool', 'zip bags', 'ziploc', 'parchment paper', 'baking paper', 'matches', 'candles', 'air freshener', 'mosquito repellent', 'agarbatti', 'incense', 'hand wash', 'sanitizer', 'gloves', 'mop', 'broom', 'kitchen towels', 'tissue paper',
  ],
  'Personal care': [
    'shampoo', 'conditioner', 'soap', 'body wash', 'toothpaste', 'toothbrush', 'floss', 'deodorant',
    'razor', 'lotion', 'sunscreen', 'face wash', 'moisturiser', 'moisturizer', 'cotton', 'pads', 'tampons',
    'medicine', 'vitamins', 'plasters', 'band-aids',
    'shaving cream', 'aftershave', 'hair oil', 'coconut oil', 'hair gel', 'comb', 'mouthwash', 'lip balm', 'face cream', 'sunscreen lotion', 'cotton buds', 'q-tips', 'nail cutter', 'sanitary pads', 'diapers', 'wipes', 'baby wipes', 'paracetamol', 'ibuprofen', 'antacid', 'cough syrup', 'bandages', 'contact lens solution',
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
