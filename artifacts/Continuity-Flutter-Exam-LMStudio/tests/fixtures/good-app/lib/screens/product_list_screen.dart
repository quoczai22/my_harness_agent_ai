import 'package:flutter/material.dart';
import '../models/product.dart';

class ProductListScreen extends StatefulWidget {
  const ProductListScreen({super.key});

  @override
  State<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends State<ProductListScreen> {
  final List<Product> _items = [const Product(id: 1, name: 'Áo thun', price: 120000)];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sản phẩm')),
      body: ListView(
        children: [
          Image.asset('assets/images/logo.png'),
          for (final p in _items)
            ListTile(
              title: Text(p.name),
              onTap: () => Navigator.pushNamed(context, '/detail', arguments: p),
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => setState(() => _items.add(const Product(id: 2, name: 'Giày', price: 1))),
        child: const Icon(Icons.add),
      ),
    );
  }
}
