// Sinh từ mẫu JSON trong đề (không dùng AI).

class Product {
  final int id;
  final String name;
  final double price;
  final bool inStock;
  final List<String> tags;
  final Category? category;

  const Product({required this.id, required this.name, required this.price, required this.inStock, required this.tags, this.category});

  factory Product.fromJson(Map<String, dynamic> json) => Product(
        id: json['id'] as int,
        name: json['name'] as String,
        price: (json['price'] as num).toDouble(),
        inStock: json['inStock'] as bool,
        tags: (json['tags'] as List<dynamic>).map((e) => e as String).toList(),
        category: json['category'] == null ? null : Category.fromJson(json['category'] as Map<String, dynamic>),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'price': price,
        'inStock': inStock,
        'tags': tags,
        'category': category?.toJson(),
      };
}

class Category {
  final int id;
  final String title;

  const Category({required this.id, required this.title});

  factory Category.fromJson(Map<String, dynamic> json) => Category(
        id: json['id'] as int,
        title: json['title'] as String,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
      };
}
