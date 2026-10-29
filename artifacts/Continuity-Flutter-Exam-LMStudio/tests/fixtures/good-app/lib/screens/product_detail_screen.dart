import 'package:flutter/material.dart';
import 'package:product_app/models/product.dart';

class ProductDetailScreen extends StatelessWidget {
  const ProductDetailScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final product = ModalRoute.of(context)!.settings.arguments as Product;
    return Scaffold(appBar: AppBar(title: Text(product.name)), body: Text('${product.price}'));
  }
}
