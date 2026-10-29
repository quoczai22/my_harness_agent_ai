import 'package:flutter/material.dart';
import 'package:product_app/screens/product_list_screen.dart';
import 'package:product_app/screens/product_detail_screen.dart';
import 'package:product_app/screens/add_product_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'product_app',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: Colors.blue, useMaterial3: true),
      initialRoute: '/',
      routes: {
        '/': (context) => const ProductListScreen(),
        '/product_detail': (context) => const ProductDetailScreen(),
        '/add_product': (context) => const AddProductScreen(),
      },
    );
  }
}