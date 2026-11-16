// Bisagra horizontal print-in-place, abierta: 60 x 30 mm.
// OpenSCAD 2021.01. Dos cuerpos independientes, sin soportes internos.
$fn = 64;

ancho = 60;
profundidad = 30;
juego = 0.4;
pared = 1.6;
eje_d = 4;
radio_eje = eje_d/2;
altura_eje = 5;
radio_barril = 5;
espesor_hoja = 4.4;
inicio_hoja = 6;
chaflan = 0.6;
numero_nudos = 11;
paso = (ancho + juego)/numero_nudos;
largo_nudo = paso-juego;
// Compensa la discretizacion del agujero: juego radial minimo 0.4.
radio_agujero = (radio_eje+juego)/cos(180/$fn);

module extrusion_x(x, longitud) {
    translate([x,0,altura_eje])
        rotate([90,0,90])
            linear_extrude(height=longitud, convexity=10)
                children();
}

// Perfil exterior: redondo arriba y flancos inferiores a 45 grados.
// El pequeño tramo plano inferior aporta apoyo propio a cada nudo.
module perfil_barril() {
    hull() {
        circle(r=radio_barril);
        translate([-(sqrt(2)-1)*radio_barril,-altura_eje])
            square([2*(sqrt(2)-1)*radio_barril,0.12]);
    }
}

// Agujero circular con techo de lagrima autosustentado.
// La envolvente circular admite el giro completo del eje romboidal.
module perfil_agujero() {
    union() {
        circle(r=radio_agujero);
        polygon([
            [-radio_agujero/sqrt(2),radio_agujero/sqrt(2)],
            [ radio_agujero/sqrt(2),radio_agujero/sqrt(2)],
            [0,radio_agujero*sqrt(2)]
        ]);
    }
}

module perfil_eje() {
    polygon([[0,-radio_eje],[radio_eje,0],
             [0,radio_eje],[-radio_eje,0]]);
}

module seccion_rectangular(x,y,dx,dy,z,inset) {
    translate([x+inset,y+inset,z])
        cube([dx-2*inset,dy-2*inset,0.01]);
}

// Bisel superior y alivio inferior contra pie de elefante.
module bloque_biselado(x,y,dx,dy,h) {
    hull() {
        seccion_rectangular(x,y,dx,dy,0,0.2);
        seccion_rectangular(x,y,dx,dy,0.25,0);
        seccion_rectangular(x,y,dx,dy,h-chaflan,0);
        seccion_rectangular(x,y,dx,dy,h-0.01,chaflan);
    }
}

module barril(i, perforado=false) {
    x = i*paso;
    difference() {
        extrusion_x(x,largo_nudo) perfil_barril();
        if (perforado) {
            extrusion_x(x-0.02,largo_nudo+0.04)
                perfil_agujero();
            // Chaflanes de entrada en ambas bocas del cojinete.
            translate([x-0.01,0,altura_eje])
                rotate([90,0,90])
                    linear_extrude(height=0.36,scale=1/1.12)
                        scale(1.12) perfil_agujero();
            translate([x+largo_nudo+0.01,0,altura_eje])
                rotate([90,0,-90])
                    linear_extrude(height=0.36,scale=1/1.12)
                        scale(1.12) perfil_agujero();
        }
    }
}

// Raices anchas: cada nudo se integra solo con SU hoja.
module raiz(i, lado) {
    x = i*paso;
    if (lado < 0)
        translate([x,-7,0]) cube([largo_nudo,4,3.2]);
    else
        translate([x,3,0]) cube([largo_nudo,4,3.2]);
}

// Dos topes inferiores de apertura. Quedan dentro de sendos
// alojamientos de la otra hoja, con 0.4 mm libres por arriba y lados.
module topes_apertura() {
    for(i=[2,8])
        translate([i*paso,3.5,0])
            cube([largo_nudo,6.5,2]);
}

module alojamientos_topes() {
    for(i=[2,8])
        translate([i*paso-juego,5.5,-0.1])
            cube([largo_nudo+2*juego,4.5+juego,2.5]);
}

// Contactos amplios de cierre, unidos a la cara superior de la hoja A.
module topes_cierre() {
    for(x=[18,36])
        hull() {
            translate([x,-13.5,4.1]) cube([6,5,0.5]);
            translate([x+0.3,-13.2,5.19]) cube([5.4,4.4,0.01]);
        }
}

module hoja_A() {
    union() {
        bloque_biselado(0,-profundidad/2,ancho,
                        profundidad/2-inicio_hoja,espesor_hoja);
        for(i=[0:2:numero_nudos-1]) {
            barril(i,false);
            raiz(i,-1);
        }
        // Eje continuo solidario con los seis nudos de A.
        // Sus cinco tramos libres son puentes cortos, de unos 5.9 mm.
        extrusion_x(0,ancho) perfil_eje();
        topes_apertura();
        topes_cierre();
    }
}

module hoja_B() {
    difference() {
        union() {
            bloque_biselado(0,inicio_hoja,ancho,
                            profundidad/2-inicio_hoja,espesor_hoja);
            for(i=[1:2:numero_nudos-2]) {
                barril(i,true);
                raiz(i,1);
            }
        }
        alojamientos_topes();
    }
}

// No hay base comun: A y B siguen siendo dos cuerpos cautivos.
// La interseccion conserva exactamente z >= 0.
intersection() {
    union() {
        hoja_A();
        hoja_B();
    }
    translate([-1,-16,0]) cube([62,32,20]);
}
