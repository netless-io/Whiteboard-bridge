import * as React from "react";
import {CursorAdapter, CursorDescription, Cursor, RoomMember} from "white-web-sdk";
import "./UserCursor.less";
import selector from "./assets/selector.svg";
import pencil from "./assets/pencil.svg";
import text from "./assets/text.svg";
import eraser from "./assets/eraser.svg";
import ellipse from "./assets/ellipse.svg";
import rectangle from "./assets/rectangle.png";

export type CursorComponentProps = {
    roomMember: RoomMember;
};

type ApplianceDescription = {
    readonly iconUrl: string;
    readonly hasColor: boolean;
    readonly hasStroke: boolean;
};

class CursorComponent extends React.Component<CursorComponentProps, {}> {
    public constructor(props: CursorComponentProps) {
        super(props);
    }
    private static readonly descriptions: {readonly [applianceName: string]: ApplianceDescription} = Object.freeze({
        selector: Object.freeze({
            iconUrl: selector,
            hasColor: false,
            hasStroke: false,
        }),
        pencil: Object.freeze({
            iconUrl: pencil,
            hasColor: true,
            hasStroke: true,
        }),
        text: Object.freeze({
            iconUrl: text,
            hasColor: true,
            hasStroke: false,
        }),
        eraser: Object.freeze({
            iconUrl: eraser,
            hasColor: false,
            hasStroke: false,
        }),
        ellipse: Object.freeze({
            iconUrl: ellipse,
            hasColor: true,
            hasStroke: true,
        }),
        rectangle: Object.freeze({
            iconUrl: rectangle,
            hasColor: true,
            hasStroke: true,
        }),
    });

    private iconUrl = (name: string): string => {
        return CursorComponent.descriptions[name].iconUrl;
    }

    public render(): React.ReactNode {
        const {roomMember} = this.props;
        const color = `rgb(${roomMember.memberState.strokeColor[0]}, ${roomMember.memberState.strokeColor[1]}, ${roomMember.memberState.strokeColor[2]})`;
        if (!this.props.roomMember.payload || !this.props.roomMember.payload.avatar) {
            return null;
        }
        return (
            <div>
                <div style={{borderColor: color}} className="cursor-box">
                    <img src={this.props.roomMember.payload!.avatar}/>
                </div>
                <div style={{backgroundColor: color}}  className="cursor-box-tool">
                    <img src={this.iconUrl(roomMember.memberState.currentApplianceName)}/>
                </div>
            </div>
        );
    }
}

export default class UserCursor implements CursorAdapter {

    private readonly cursors: {[memberId: number]: Cursor} = {};
    private roomMembers: ReadonlyArray<RoomMember> = [];

    public createCursor(memberId: number): CursorDescription {
        return {x: 16, y: 16, width: 32, height: 32};
    }

    public onMovingCursor(cursor: Cursor, positionX: number, positionY: number): void {}

    public onAddedCursor(cursor: Cursor): void {
        for (const roomMember of this.roomMembers) {
            if (roomMember.memberId === cursor.memberId) {
                cursor.setReactNode((
                    <CursorComponent roomMember={roomMember} />
                ));
                break;
            }
        }
        this.cursors[cursor.memberId] = cursor;
    }
    public onRemovedCursor(cursor: Cursor): void {
        delete this.cursors[cursor.memberId];
    }

    public setColorAndAppliance(roomMembers: ReadonlyArray<RoomMember>): void {
        this.roomMembers = roomMembers;
        for (const roomMember of roomMembers) {
            const cursor = this.cursors[roomMember.memberId];
            if (cursor) {
                cursor.setReactNode((
                    <CursorComponent roomMember={roomMember} />
                ));
            }
        }
    }
}